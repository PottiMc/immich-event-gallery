/*
 * Newsletter page of the admin server. Confirmed sign-ups are carried over
 * into the newsletter tool by hand; this page lists them, exports them and
 * remembers which ones are done.
 *
 *   GET  /newsletter                  page (?alle = also added and unconfirmed)
 *   POST /newsletter/einstellungen    sign-up on/off, position, again at the end, sticky bar
 *   POST /newsletter/uebertragen      mark one (`mail`) or all new (`alle-neuen`) as added (`an`=1) or not (`an`=0)
 *   POST /newsletter/loeschen         delete one (`mail`)
 *   POST /newsletter/testmail         test e-mail to the sender address
 *
 * JSON API for scripts (POSTs need the X-CSRF-Token header):
 *   GET  /api/newsletter              { entries }
 *   POST /api/newsletter/uebertragen  { mails, an } -> { ok, anzahl, offen }
 *   POST /api/newsletter/loeschen     { mail } -> { ok }
 *   GET  /api/newsletter.csv          ?neu=1 new only, ?alle=1 also unconfirmed, default all confirmed
 *   POST /api/mail/test               -> { ok, host, port, security, from } or { ok: false, error }
 */

import dayjs from 'dayjs'
import express from 'express'
import { Express, Request, Response } from 'express-serve-static-core'
import { h } from 'preact'
import { asyncHandler } from '../http'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { adminFormToken, validFormPost } from './admin-forms'
import { NewsletterAdminPage } from './admin-newsletter-views'
import { Lang, langOf, t } from './i18n'
import { describeMailConfig, isValidEmail, mailConfig, mailEnabled, mailErrorText, sendMail } from './mail'
import { listEntries, markTransferred, NewsletterEntry, notifyAddress, pendingCount, pendingEntries, removeEntry } from './newsletter'
import {
  NEWSLETTER_AFTER_MAX,
  newsletterAfter,
  newsletterAtEnd,
  newsletterSticky,
  newsletterSwitchedOn,
  saveRuntimeSettings,
  settingsPersistent
} from './runtime-settings'

const MAX_BATCH = 1000

function render (req: Request, res: Response, status = 200, extra: { notice?: string, error?: string } = {}) {
  const lang = langOf(res)
  const m = t(lang).nlAdmin
  const query = req.query as Record<string, unknown>
  const showAll = 'alle' in query
  let notice = extra.notice
  if (!notice) {
    if ('gespeichert' in query) notice = m.saved
    else if (typeof query.markiert === 'string') notice = m.marked(Number(query.markiert) || 0)
    else if ('zurueck' in query) notice = m.unmarked
    else if ('geloescht' in query) notice = m.removed
  }
  const all = listEntries()
  res.status(status).send(renderPage(h(NewsletterAdminPage, {
    lang,
    csrf: adminFormToken(),
    entries: showAll ? all : all.filter(e => e.confirmedAt && !e.transferredAt),
    pending: pendingEntries(),
    showAll,
    enabled: newsletterSwitchedOn(),
    after: newsletterAfter(),
    atEnd: newsletterAtEnd(),
    sticky: newsletterSticky(),
    mailOn: mailEnabled(),
    mailDescription: describeMailConfig(),
    notify: notifyAddress(),
    persistent: settingsPersistent(),
    notice,
    error: extra.error ?? ('nicht-dauerhaft' in query ? m.notPersisted : undefined)
  })))
}

/** Where to go back to after a form: keep the "show all" filter. */
function back (req: Request, flag: string): string {
  const all = 'alle' in (req.query as Record<string, unknown>)
  return '/newsletter?' + (all ? 'alle&' : '') + flag + '#newsletter'
}

function emailsFrom (value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value]
  return list.filter(isValidEmail).slice(0, MAX_BATCH)
}

function csvCell (value: string): string {
  // Cells starting with = + - @ would run as formulas in Excel
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value
  return /[;"\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

/** Semicolon CSV with a BOM, so Excel opens it with the right umlauts. */
export function newsletterCsv (entries: NewsletterEntry[], lang: Lang): string {
  const m = t(lang)
  const date = (iso: string | null) => iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : ''
  const rows = entries.map(e => [e.email, e.name, e.source, date(e.requestedAt), date(e.confirmedAt), e.ip, date(e.transferredAt)])
  return '﻿' + [m.nlAdmin.csvHeader, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

async function sendTestMail (lang: Lang): Promise<{ ok: true, to: string } | { ok: false, error: string }> {
  const to = mailConfig().fromAddress
  const m = t(lang).nlAdmin
  try {
    await sendMail({ to, subject: m.testSubject, text: m.testText })
    log('Admin: test e-mail sent to ' + to)
    return { ok: true, to }
  } catch (e) {
    const error = mailErrorText(e, lang)
    log.warn('Admin: test e-mail failed: ' + mailErrorText(e, 'en'))
    return { ok: false, error }
  }
}

const form = express.urlencoded({ extended: false, limit: '64kb' })
const json = express.json({ limit: '64kb' })

export function registerNewsletterAdminRoutes (app: Express) {
  app.get('/newsletter', (req, res) => render(req, res))

  app.post('/newsletter/einstellungen', form, (req, res) => {
    const after = Number(req.body?.after)
    if (!validFormPost(req) || !Number.isInteger(after) || after < 1 || after > NEWSLETTER_AFTER_MAX) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const enabled = req.body?.enabled === '1'
    const atEnd = req.body?.atEnd === '1'
    const sticky = req.body?.sticky === '1'
    const result = saveRuntimeSettings({ newsletterEnabled: enabled, newsletterAfter: after, newsletterAtEnd: atEnd, newsletterSticky: sticky })
    log('Admin: newsletter sign-up ' + (enabled ? 'on' : 'off') + ', after ' + after + ' photos' +
      (atEnd ? ', again at the end' : '') + (sticky ? ', sticky bar' : ''))
    res.redirect(303, '/newsletter?' + (result.ok ? 'gespeichert' : 'nicht-dauerhaft') + '#einstellungen')
  })

  app.post('/newsletter/uebertragen', form, (req, res) => {
    if (!validFormPost(req)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const on = req.body?.an !== '0'
    const emails = req.body?.['alle-neuen'] === '1' ? pendingEntries().map(e => e.email) : emailsFrom(req.body?.mail)
    const changed = markTransferred(emails, on)
    log('Admin: ' + changed + ' newsletter address(es) marked as ' + (on ? 'added' : 'not added'))
    res.redirect(303, back(req, on ? 'markiert=' + changed : 'zurueck'))
  })

  app.post('/newsletter/loeschen', form, (req, res) => {
    const email = req.body?.mail
    if (!validFormPost(req) || !isValidEmail(email)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    removeEntry(email)
    log('Admin: newsletter address deleted')
    res.redirect(303, back(req, 'geloescht'))
  })

  app.post('/newsletter/testmail', form, asyncHandler(async (req, res) => {
    const lang = langOf(res)
    if (!validFormPost(req)) {
      res.status(400).send(t(lang).admin.invalidForm)
      return
    }
    const result = await sendTestMail(lang)
    const m = t(lang).nlAdmin
    if (result.ok) render(req, res, 200, { notice: m.testOk(result.to) })
    else render(req, res, 502, { error: m.testFailed(result.error) })
  }))

  // ----- JSON API -----

  app.get('/api/newsletter', (_req, res) => {
    res.json({ entries: listEntries() })
  })

  app.post('/api/newsletter/uebertragen', json, (req, res) => {
    if (!validFormPost(req) || !Array.isArray(req.body?.mails) || req.body.mails.length > MAX_BATCH) {
      res.status(400).json({ ok: false })
      return
    }
    const count = markTransferred(emailsFrom(req.body.mails), req.body.an !== false)
    res.json({ ok: true, anzahl: count, offen: pendingCount() })
  })

  app.post('/api/newsletter/loeschen', json, (req, res) => {
    if (!validFormPost(req) || !isValidEmail(req.body?.mail)) {
      res.status(400).json({ ok: false })
      return
    }
    res.json({ ok: removeEntry(req.body.mail) })
  })

  app.get('/api/newsletter.csv', (req, res) => {
    const query = req.query as Record<string, unknown>
    let entries = listEntries()
    if (query.neu === '1') entries = entries.filter(e => e.confirmedAt && !e.transferredAt)
    else if (query.alle !== '1') entries = entries.filter(e => e.confirmedAt)
    const name = 'newsletter-' + (query.neu === '1' ? 'neu-' : '') + dayjs().format('YYYY-MM-DD') + '.csv'
    res.type('text/csv; charset=utf-8')
    res.attachment(name)
    res.send(newsletterCsv(entries, langOf(res)))
  })

  app.post('/api/mail/test', json, asyncHandler(async (req, res) => {
    if (!validFormPost(req)) {
      res.status(400).json({ ok: false })
      return
    }
    const config = mailConfig()
    const result = await sendTestMail(langOf(res))
    res.status(result.ok ? 200 : 502).json({
      ...result,
      host: config.host,
      port: config.port,
      security: config.security,
      from: config.fromAddress
    })
  }))
}
