/*
 * Branding page of the admin server: brand texts and links, logos and icons.
 * Everything is stored in the data folder (see branding.ts) and applies at
 * once, without a restart.
 */

import express from 'express'
import { Express, NextFunction, Request, Response } from 'express-serve-static-core'
import { h } from 'preact'
import { getConfigOption } from '../config/access'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { validFormPost, adminFormToken } from './admin-forms'
import { BrandingPage, BrandTextValues, ImageView } from './admin-branding-views'
import {
  BRAND_SLOTS,
  brandFileSource,
  brandingTexts,
  brandSlot,
  brandTextSource,
  brandUrl,
  hasAdminTexts,
  ImageFormat,
  imageInfo,
  MAX_BRAND_FILE_BYTES,
  readBrandFile,
  resetBrandFile,
  resetBrandTexts,
  saveBrandFile,
  saveBrandTexts
} from './branding'
import { Lang, langOf, t } from './i18n'
import { settingsPersistent } from './runtime-settings'
import { publicBaseUrl, shareUrl } from './settings'

const URL_FIELDS = ['websiteUrl', 'imprintUrl', 'privacyUrl', 'shareUrl'] as const
const MAX_NAME = 80
const MAX_URL = 500
const MAX_SHARE_TEXT = 300

function stringFor (value: unknown, lang: Lang): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const perLang = (value as Record<string, unknown>)[lang]
    return typeof perLang === 'string' ? perLang : ''
  }
  return ''
}

function textValue (key: string): unknown {
  return brandingTexts()[key] ?? getConfigOption('portal.' + key, undefined)
}

/** What the form shows: the values that apply right now. */
function currentValues (): BrandTextValues {
  return {
    brandName: stringFor(textValue('brandName'), 'en'),
    websiteUrl: stringFor(textValue('websiteUrl'), 'en'),
    imprintUrl: stringFor(textValue('imprintUrl'), 'en'),
    privacyUrl: stringFor(textValue('privacyUrl'), 'en'),
    shareUrl: shareUrl(),
    shareTextEn: stringFor(textValue('shareText'), 'en'),
    shareTextDe: stringFor(textValue('shareText'), 'de')
  }
}

function postedValues (body: Record<string, unknown>): BrandTextValues {
  const get = (key: string) => typeof body?.[key] === 'string' ? (body[key] as string).trim() : ''
  return {
    brandName: get('brandName'),
    websiteUrl: get('websiteUrl'),
    imprintUrl: get('imprintUrl'),
    privacyUrl: get('privacyUrl'),
    shareUrl: get('shareUrl'),
    shareTextEn: get('shareTextEn'),
    shareTextDe: get('shareTextDe')
  }
}

/** Only full http(s) addresses: the links end up in href attributes on guest pages. */
export function isWebAddress (value: string): boolean {
  if (!/^https?:\/\/[^\s<>"]+$/i.test(value)) return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export type ParsedTexts = { ok: true, texts: Record<string, unknown> } | { ok: false, field: keyof BrandTextValues, reason: 'url' | 'length' }

/**
 * Validate the texts form. Every key is stored, empty ones too: an empty name
 * or share text falls back to the default, an empty link is hidden.
 */
export function parseBrandTexts (body: Record<string, unknown>): ParsedTexts {
  const values = postedValues(body)
  if (values.brandName.length > MAX_NAME) return { ok: false, field: 'brandName', reason: 'length' }
  for (const key of URL_FIELDS) {
    if (values[key].length > MAX_URL) return { ok: false, field: key, reason: 'length' }
    if (values[key] && !isWebAddress(values[key])) return { ok: false, field: key, reason: 'url' }
  }
  if (values.shareTextEn.length > MAX_SHARE_TEXT) return { ok: false, field: 'shareTextEn', reason: 'length' }
  if (values.shareTextDe.length > MAX_SHARE_TEXT) return { ok: false, field: 'shareTextDe', reason: 'length' }
  return {
    ok: true,
    texts: {
      brandName: values.brandName,
      websiteUrl: values.websiteUrl,
      imprintUrl: values.imprintUrl,
      privacyUrl: values.privacyUrl,
      shareUrl: values.shareUrl,
      shareText: { en: values.shareTextEn, de: values.shareTextDe }
    }
  }
}

const FORMAT_LABEL: Record<ImageFormat, string> = { png: 'PNG', jpeg: 'JPEG', ico: 'ICO' }

function formatLabel (formats: ImageFormat[]): string {
  return formats.map(format => FORMAT_LABEL[format]).join(' / ')
}

function imageViews (lang: Lang): ImageView[] {
  const m = t(lang).branding
  return BRAND_SLOTS.map(slot => {
    const file = readBrandFile(slot.name)
    const info = file ? imageInfo(file) : undefined
    const ratio = slot.width / slot.height
    const ratioWarning = !!(info?.width && info.height && slot.name !== 'favicon.ico' &&
      Math.abs(info.width / info.height - ratio) / ratio > 0.05)
    const [label, usage] = m.slots[slot.name] || [slot.name, '']
    return {
      name: slot.name,
      label,
      usage,
      url: brandUrl(slot.name),
      source: brandFileSource(slot.name),
      recommended: `${slot.width} × ${slot.height} · ${formatLabel(slot.formats)}`,
      current: info?.width && info.height ? `${info.width} × ${info.height} · ${FORMAT_LABEL[info.format]}` : undefined,
      ratioWarning,
      accept: slot.formats.map(format => format === 'jpeg' ? 'image/jpeg' : format === 'ico' ? '.ico,image/x-icon,image/png' : 'image/png').join(','),
      light: slot.name === 'logo-light.png'
    }
  })
}

interface RenderOptions {
  values?: BrandTextValues
  error?: string
  notice?: 'saved' | 'texts-reset'
}

function renderBranding (req: Request, res: Response, status: number, options: RenderOptions = {}) {
  const lang = langOf(res)
  const query = req.query as Record<string, unknown>
  const imageNotice = typeof query.hochgeladen === 'string'
    ? { name: query.hochgeladen, kind: 'saved' as const }
    : typeof query.zurueckgesetzt === 'string' ? { name: query.zurueckgesetzt, kind: 'reset' as const } : undefined
  const notice = options.notice || ('gespeichert' in query ? 'saved' : 'texte-zurueckgesetzt' in query ? 'texts-reset' : undefined)
  const sourceOf = (key: string) => brandTextSource(key)
  res.status(status).send(renderPage(h(BrandingPage, {
    lang,
    csrf: adminFormToken(),
    persistent: settingsPersistent(),
    baseUrl: publicBaseUrl(),
    values: options.values || currentValues(),
    sources: {
      brandName: sourceOf('brandName'),
      websiteUrl: sourceOf('websiteUrl'),
      imprintUrl: sourceOf('imprintUrl'),
      privacyUrl: sourceOf('privacyUrl'),
      shareUrl: sourceOf('shareUrl'),
      shareTextEn: sourceOf('shareText'),
      shareTextDe: sourceOf('shareText')
    },
    hasAdminTexts: hasAdminTexts(),
    notice,
    error: options.error,
    images: imageViews(lang),
    imageNotice: imageNotice && brandSlot(imageNotice.name) ? imageNotice : undefined
  })))
}

const form = express.urlencoded({ extended: false, limit: '16kb' })

export function registerBrandingRoutes (app: Express) {
  app.get('/branding', (req, res) => renderBranding(req, res, 200))

  app.post('/branding/texte', form, (req, res) => {
    const m = t(langOf(res))
    if (!validFormPost(req)) {
      res.status(400).send(m.admin.invalidForm)
      return
    }
    const parsed = parseBrandTexts(req.body)
    if (!parsed.ok) {
      const label = String(m.branding[parsed.field])
      renderBranding(req, res, 400, {
        values: postedValues(req.body),
        error: parsed.reason === 'url' ? m.branding.invalidUrl(label) : m.branding.tooLong(label)
      })
      return
    }
    const result = saveBrandTexts(parsed.texts)
    if (!result.ok) {
      renderBranding(req, res, 500, { values: postedValues(req.body), error: m.branding.saveFailed })
      return
    }
    log('Admin: brand texts saved')
    res.redirect(303, '/branding?gespeichert#texte')
  })

  app.post('/branding/texte/zuruecksetzen', form, (req, res) => {
    if (!validFormPost(req)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const result = resetBrandTexts()
    if (!result.ok) {
      renderBranding(req, res, 500, { error: t(langOf(res)).branding.saveFailed })
      return
    }
    log('Admin: brand texts reset')
    res.redirect(303, '/branding?texte-zurueckgesetzt#texte')
  })

  app.post('/branding/bild/:name',
    express.raw({ type: 'application/octet-stream', limit: MAX_BRAND_FILE_BYTES }),
    (req: Request, res: Response) => {
      const m = t(langOf(res)).branding
      const slot = brandSlot(req.params.name)
      if (!validFormPost(req) || !slot) {
        res.status(400).json({ error: m.uploadFailed })
        return
      }
      const result = saveBrandFile(slot.name, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0))
      if (result.ok) {
        log('Admin: brand image ' + slot.name + ' uploaded')
        res.json({ ok: true })
      } else if (result.error === 'type') {
        res.status(415).json({ error: m.wrongType(formatLabel(slot.formats)) })
      } else if (result.error === 'size') {
        res.status(413).json({ error: m.tooLarge })
      } else {
        res.status(500).json({ error: m.saveFailed })
      }
    },
    (err: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
      if (err?.type !== 'entity.too.large') return next(err)
      res.status(413).json({ error: t(langOf(res)).branding.tooLarge })
    })

  app.post('/branding/bild/:name/zuruecksetzen', form, (req, res) => {
    const slot = brandSlot(req.params.name)
    if (!validFormPost(req) || !slot) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const result = resetBrandFile(slot.name)
    if (!result.ok) {
      renderBranding(req, res, 500, { error: t(langOf(res)).branding.saveFailed })
      return
    }
    log('Admin: brand image ' + slot.name + ' reset')
    res.redirect(303, '/branding?zurueckgesetzt=' + encodeURIComponent(slot.name) + '#bilder')
  })
}
