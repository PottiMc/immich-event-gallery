/*
 * Newsletter sign-up with double opt-in.
 *
 * A guest enters an e-mail address in an album (POST /share/:key/newsletter)
 * and gets a confirmation e-mail. The link in it carries the sign-up itself,
 * signed with a key derived from PORTAL_SECRET, so no token needs storing.
 * GET /newsletter/:token only asks; mail programs and virus scanners open
 * links on their own, so only the POST from that page confirms. Confirmed
 * addresses land in DATA_DIR/newsletter.json, and the operator gets an
 * e-mail per new one. Adding them to the actual newsletter tool is left to
 * the operator (admin page "Newsletter").
 *
 * Shown only when switched on in the admin and e-mail is configured (mail.ts).
 */

import crypto from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import dayjs from 'dayjs'
import { Express, Request, Response } from 'express-serve-static-core'
import { h } from 'preact'
import { asyncHandler } from '../http'
import { title } from '../share'
import { SharedLink } from '../types'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { safeEquals } from './admin-forms'
import { brandColors } from './branding'
import { Lang, langOf, t } from './i18n'
import { isValidEmail, mailConfig, mailEnabled, mailErrorText, maskEmail, operatorLang, sendMail } from './mail'
import { NewsletterPage, NewsletterPageState } from './newsletter-views'
import { dataDir, newsletterSwitchedOn } from './runtime-settings'
import { clientIp, throttleKey } from './security'
import { brandName, deriveKey, instagramUrl, phoneNumber, publicBaseUrl, websiteUrl } from './settings'
import { contrast, DEFAULT_COLORS, mix, readableOn } from './theme'

export const CONFIRM_DAYS = 14
/** Unconfirmed sign-ups are dropped after this many days. */
export const UNCONFIRMED_DAYS = 30
export const MAX_NAME = 100
const MAX_SOURCE = 120
const TOKEN_PREFIX = 'nl1.'
const DAY_MS = 24 * 60 * 60_000

/** Sign-up on and e-mail working. */
export function newsletterEnabled (): boolean {
  return newsletterSwitchedOn() && mailEnabled()
}

/** Receives an e-mail per confirmed sign-up: NEWSLETTER_NOTIFY, else the sender address. */
export function notifyAddress (): string {
  const env = (process.env.NEWSLETTER_NOTIFY || '').trim()
  return isValidEmail(env) ? env : mailConfig().fromAddress
}

/** Strip control characters (header and log safety) and trim. */
function cleanText (value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : ''
}

// ----- confirmation token ---------------------------------------------------

export interface SignupData {
  /** e-mail address */
  m: string
  /** name, may be empty */
  n: string
  /** source: the album the guest signed up in */
  q: string
  /** time of the request, Unix seconds */
  t: number
}

function sign (payload: string): string {
  return crypto.createHmac('sha256', deriveKey('newsletter'))
    .update(TOKEN_PREFIX + payload)
    .digest()
    .subarray(0, 18)
    .toString('base64url')
}

export function createConfirmToken (email: string, name: string, source: string, now = Date.now()): string {
  const data: SignupData = { m: email, n: name, q: source, t: Math.floor(now / 1000) }
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
  return payload + '.' + sign(payload)
}

/** The sign-up in a token, or undefined if it is forged, changed or expired. */
export function verifyConfirmToken (token: unknown, now = Date.now()): SignupData | undefined {
  if (typeof token !== 'string' || token.length > 2000) return undefined
  const dot = token.indexOf('.')
  if (dot < 1) return undefined
  const payload = token.slice(0, dot)
  if (!safeEquals(token.slice(dot + 1), sign(payload))) return undefined
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || typeof data.t !== 'number' || !isValidEmail(data.m)) return undefined
    const age = now - data.t * 1000
    if (age > CONFIRM_DAYS * DAY_MS || age < -DAY_MS) return undefined
    return { m: data.m, n: cleanText(data.n, MAX_NAME), q: cleanText(data.q, MAX_SOURCE), t: data.t }
  } catch {
    return undefined
  }
}

// ----- the list -------------------------------------------------------------

export interface NewsletterEntry {
  email: string
  name: string
  source: string
  /** ISO timestamps; null = not (yet) */
  requestedAt: string
  confirmedAt: string | null
  ip: string
  transferredAt: string | null
}

/*
 * The file is read once and kept in memory. All changes are synchronous, so
 * two requests can never interleave between reading and writing.
 */
let entries: NewsletterEntry[] | undefined

function listFile (): string {
  return join(dataDir(), 'newsletter.json')
}

/** Forget the cached list (tests). */
export function resetNewsletterCache () {
  entries = undefined
}

function isoOrNull (value: unknown): string | null {
  return typeof value === 'string' && !isNaN(Date.parse(value)) ? value : null
}

function sanitizeEntry (raw: unknown): NewsletterEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const requestedAt = isoOrNull(r.requestedAt)
  if (!isValidEmail(r.email) || !requestedAt) return undefined
  return {
    email: r.email,
    name: cleanText(r.name, MAX_NAME),
    source: cleanText(r.source, MAX_SOURCE),
    requestedAt,
    confirmedAt: isoOrNull(r.confirmedAt),
    ip: cleanText(r.ip, 64),
    transferredAt: isoOrNull(r.transferredAt)
  }
}

function withoutExpired (list: NewsletterEntry[], now = Date.now()): NewsletterEntry[] {
  return list.filter(e => e.confirmedAt || now - Date.parse(e.requestedAt) <= UNCONFIRMED_DAYS * DAY_MS)
}

function load (): NewsletterEntry[] {
  if (entries) return entries
  let loaded: NewsletterEntry[] = []
  const file = listFile()
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      const raw: unknown[] = Array.isArray(parsed?.entries) ? parsed.entries : []
      loaded = raw.map(sanitizeEntry).filter((e): e is NewsletterEntry => !!e)
    } catch (e) {
      log.warn('Ignoring ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  entries = loaded
  return loaded
}

function save (list: NewsletterEntry[]): boolean {
  entries = withoutExpired(list)
  const file = listFile()
  try {
    mkdirSync(dataDir(), { recursive: true })
    // Write-then-rename, so a crash never leaves a half-written file behind
    writeFileSync(file + '.tmp', JSON.stringify({ entries }, null, 2) + '\n', 'utf8')
    renameSync(file + '.tmp', file)
    return true
  } catch (e) {
    log.warn('Could not save ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    return false
  }
}

function sameAddress (a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Note a sign-up after its confirmation e-mail went out. An unconfirmed entry
 * is refreshed; a confirmed one stays as it is.
 */
export function recordRequest (email: string, name: string, source: string, now = new Date()) {
  const list = load()
  const existing = list.find(e => sameAddress(e.email, email))
  if (existing?.confirmedAt) return
  const entry: NewsletterEntry = {
    email,
    name,
    source,
    requestedAt: now.toISOString(),
    confirmedAt: null,
    ip: '',
    transferredAt: null
  }
  save(existing ? list.map(e => e === existing ? entry : e) : [...list, entry])
}

/** Confirm a sign-up. False if the address was confirmed before. */
export function confirmSignup (data: SignupData, ip: string, now = new Date()): boolean {
  const list = load()
  const existing = list.find(e => sameAddress(e.email, data.m))
  if (existing?.confirmedAt) return false
  const entry: NewsletterEntry = {
    email: data.m,
    name: data.n,
    source: data.q,
    // The list may have been lost in between: the token knows the request time
    requestedAt: existing?.requestedAt || new Date(data.t * 1000).toISOString(),
    confirmedAt: now.toISOString(),
    ip,
    transferredAt: null
  }
  save(existing ? list.map(e => e === existing ? entry : e) : [...list, entry])
  return true
}

/** Tick confirmed addresses off as added to the newsletter tool (or undo it). Returns the number changed. */
export function markTransferred (emails: string[], on: boolean, now = new Date()): number {
  const wanted = new Set(emails.map(e => e.toLowerCase()))
  let changed = 0
  const list = load().map(e => {
    if (!e.confirmedAt || !wanted.has(e.email.toLowerCase())) return e
    if (on === !!e.transferredAt) return e
    changed++
    return { ...e, transferredAt: on ? now.toISOString() : null }
  })
  if (changed) save(list)
  return changed
}

export function removeEntry (email: string): boolean {
  const list = load()
  const next = list.filter(e => !sameAddress(e.email, email))
  if (next.length === list.length) return false
  save(next)
  return true
}

/** Newest first. */
export function listEntries (now = Date.now()): NewsletterEntry[] {
  const time = (e: NewsletterEntry) => Date.parse(e.confirmedAt || e.requestedAt)
  return withoutExpired(load(), now).sort((a, b) => time(b) - time(a))
}

/** Confirmed and not yet added to the newsletter tool. */
export function pendingEntries (): NewsletterEntry[] {
  return listEntries().filter(e => e.confirmedAt && !e.transferredAt)
}

export function pendingCount (): number {
  return pendingEntries().length
}

// ----- rate limits ----------------------------------------------------------

/** Sliding window: at most `max` hits per key within `windowMs`. In memory, one container. */
export class RateWindow {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor (max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max
    this.windowMs = windowMs
    this.now = now
  }

  private recent (key: string): number[] {
    const since = this.now() - this.windowMs
    const list = (this.hits.get(key) || []).filter(time => time > since)
    if (list.length) this.hits.set(key, list)
    else this.hits.delete(key)
    return list
  }

  allowed (key: string): boolean {
    return this.recent(key).length < this.max
  }

  hit (key: string) {
    if (this.hits.size > 10_000) this.hits.clear()
    this.hits.set(key, [...this.recent(key), this.now()])
  }
}

const HOUR_MS = 60 * 60_000

function newLimits () {
  return {
    address: new RateWindow(4, HOUR_MS),
    ip: new RateWindow(20, HOUR_MS),
    all: new RateWindow(400, DAY_MS),
    confirm: new RateWindow(30, 10 * 60_000)
  }
}
let limits = newLimits()

/** For tests. */
export function resetNewsletterLimits () {
  limits = newLimits()
}

// ----- e-mails --------------------------------------------------------------

function escapeHtml (value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** A brand color darkened until it is readable on white paper. */
function onWhite (color: string): string {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = mix(color, '#000000', amount)
    if (contrast(candidate, '#ffffff') >= 4.5) return candidate
  }
  return '#000000'
}

interface SignatureLine { label: string, text: string, href?: string }

function signatureLines (lang: Lang): SignatureLine[] {
  const m = t(lang).newsletter
  const web = websiteUrl()
  const phone = phoneNumber()
  const instagram = instagramUrl()
  const from = mailConfig().fromAddress
  const lines: SignatureLine[] = []
  if (web) lines.push({ label: m.sigWeb, text: web.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: web })
  if (from) lines.push({ label: m.sigMail, text: from, href: 'mailto:' + from })
  if (phone) lines.push({ label: m.sigPhone, text: phone, href: 'tel:' + phone.replace(/[^\d+]/g, '') })
  if (instagram) lines.push({ label: 'Instagram', text: instagram.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), href: instagram })
  return lines
}

/** The confirmation e-mail to the guest, as text and HTML. */
export function confirmationMail (opts: { name: string, url: string, lang: Lang }) {
  const lang = opts.lang
  const m = t(lang).newsletter
  const brand = brandName(lang)
  const colors = { ...DEFAULT_COLORS, ...brandColors() }
  const accent = onWhite(colors.accent)
  const button = colors.button
  const signature = signatureLines(lang)
  const greeting = m.mailGreeting(opts.name)

  const text = [
    greeting,
    '',
    m.mailIntro(brand),
    '',
    opts.url,
    '',
    m.mailNote(CONFIRM_DAYS),
    m.mailIgnore,
    '',
    m.mailRegards,
    brand,
    ...signature.map(line => `${line.label}: ${line.text}`)
  ].join('\n')

  const sigHtml = signature.map(line =>
    `${escapeHtml(line.label)}: ${line.href
      ? `<a href="${escapeHtml(line.href)}" style="color:${accent};text-decoration:none">${escapeHtml(line.text)}</a>`
      : escapeHtml(line.text)}`
  ).join('<br>')
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(m.mailSubject(brand))}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#1a1612">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:${accent}">${escapeHtml(brand)}</td></tr>
<tr><td style="padding:8px 28px;font-size:16px;line-height:1.5">
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px">${escapeHtml(m.mailIntro(brand))}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${button};color:${readableOn(button)};font-weight:bold;text-decoration:none">${escapeHtml(m.mailButton)}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#6b635a">${escapeHtml(m.mailNote(CONFIRM_DAYS))}</p>
<p style="margin:0 0 20px;font-size:13px;color:#6b635a">${escapeHtml(m.mailIgnore)}</p>
</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:14px;line-height:1.6;border-top:1px solid #eee5d8">
<p style="margin:12px 0 4px">${escapeHtml(m.mailRegards)}<br><strong>${escapeHtml(brand)}</strong></p>
<p style="margin:0;color:#6b635a">${sigHtml}</p>
</td></tr>
</table></td></tr></table>
</body></html>`
  return { subject: m.mailSubject(brand), text, html }
}

/** The e-mail to the operator about a confirmed sign-up. */
export function notificationMail (data: SignupData, ip: string, confirmedAt: Date, lang: Lang = operatorLang()) {
  const m = t(lang).newsletter
  const text = [
    m.notifyIntro,
    '',
    `${m.notifyName}: ${data.n || '–'}`,
    `${m.notifyEmail}: ${data.m}`,
    `${m.notifySource}: ${data.q || '–'}`,
    `${m.notifyConfirmed}: ${dayjs(confirmedAt).format(t(lang).dateFormat + ' HH:mm')}`,
    `IP: ${ip}`,
    '',
    m.notifyAction
  ].join('\n')
  return { subject: m.notifySubject(data.m), text }
}

// ----- routes ---------------------------------------------------------------

/**
 * [ROUTE] POST /share/:key/newsletter (JSON). The share is already resolved
 * and unlocked by the caller; its title is kept as the sign-up's source.
 */
export async function handleNewsletterSignup (req: Request, res: Response, link: SharedLink) {
  res.header('Cache-Control', 'no-store')
  const lang = langOf(res)
  const m = t(lang).newsletter
  if (!newsletterEnabled()) {
    res.status(503).json({ error: m.notConfigured })
    return
  }
  // JSON from our own page only (a cross-site JSON post needs CORS approval)
  const site = req.get('sec-fetch-site')
  if (!req.is('application/json') || (site && site !== 'same-origin')) {
    res.status(400).json({ error: m.invalidRequest })
    return
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  if (!isValidEmail(email)) {
    res.status(400).json({ error: m.invalidEmail })
    return
  }
  const name = cleanText(req.body?.name, MAX_NAME)
  const ip = throttleKey(clientIp(req))
  const address = email.toLowerCase()
  if (!limits.address.allowed(address) || !limits.ip.allowed(ip) || !limits.all.allowed('all')) {
    res.status(429).json({ error: m.throttled })
    return
  }
  limits.address.hit(address)
  limits.ip.hit(ip)
  limits.all.hit('all')

  const source = cleanText(title(link), MAX_SOURCE)
  const url = publicBaseUrl(req.headers.host, req.protocol) + '/newsletter/' + createConfirmToken(email, name, source)
  try {
    await sendMail({ to: email, replyTo: notifyAddress(), ...confirmationMail({ name, url, lang }) })
  } catch (e) {
    log.error('Newsletter: confirmation e-mail to ' + maskEmail(email) + ' failed: ' + mailErrorText(e, 'en'))
    res.status(502).json({ error: m.sendFailed })
    return
  }
  recordRequest(email, name, source)
  log('Newsletter: confirmation e-mail sent to ' + maskEmail(email) + ' from ' + ip)
  res.json({ ok: true })
}

function renderNewsletterPage (res: Response, status: number, state: NewsletterPageState, token = '', email = '') {
  res.header('Cache-Control', 'no-store')
  // The token must not travel on to other sites
  res.header('Referrer-Policy', 'no-referrer')
  res.status(status).send(renderPage(h(NewsletterPage, { lang: langOf(res), state, token, email, contact: notifyAddress() })))
}

/** GET shows the question, POST confirms. */
export function registerNewsletterRoutes (app: Express) {
  app.get('/newsletter/:token', (req, res) => {
    const data = verifyConfirmToken(req.params.token)
    if (!data) {
      renderNewsletterPage(res, 400, 'expired')
      return
    }
    renderNewsletterPage(res, 200, 'question', req.params.token, data.m)
  })

  app.post('/newsletter/:token', asyncHandler(async (req, res) => {
    // The token in the path is the proof, so no CSRF token is needed
    const ip = throttleKey(clientIp(req))
    if (!limits.confirm.allowed(ip)) {
      renderNewsletterPage(res, 429, 'throttled')
      return
    }
    limits.confirm.hit(ip)
    const data = verifyConfirmToken(req.params.token)
    if (!data) {
      renderNewsletterPage(res, 400, 'expired')
      return
    }
    const now = new Date()
    if (confirmSignup(data, ip, now)) {
      log('Newsletter: ' + maskEmail(data.m) + ' confirmed from ' + ip)
      try {
        const mail = notificationMail(data, ip, now)
        await sendMail({ to: notifyAddress(), replyTo: data.m, ...mail })
      } catch (e) {
        // The sign-up counts anyway; it is on the admin page
        log.warn('Newsletter: notification e-mail failed: ' + mailErrorText(e, 'en'))
      }
    }
    renderNewsletterPage(res, 200, 'done', '', data.m)
  }))
}
