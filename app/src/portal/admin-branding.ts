/*
 * Branding page of the admin server: brand texts and links, colors, logos and icons.
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
import { BrandingPage, BrandTextValues, ColorView, ImageView } from './admin-branding-views'
import {
  BRAND_SLOTS,
  BrandColors,
  brandColors,
  brandColorSource,
  brandFileSource,
  brandingTexts,
  brandSlot,
  brandTextSource,
  brandUrl,
  COLOR_KEYS,
  folderColors,
  hasAdminColors,
  hasAdminTexts,
  isHexColor,
  ImageFormat,
  imageInfo,
  MAX_BRAND_FILE_BYTES,
  readBrandFile,
  resetBrandColors,
  resetBrandFile,
  resetBrandTexts,
  saveBrandColors,
  saveBrandFile,
  saveBrandTexts
} from './branding'
import { Lang, langOf, t } from './i18n'
import { settingsPersistent } from './runtime-settings'
import { publicBaseUrl, shareUrl } from './settings'
import { contrast, DEFAULT_COLORS } from './theme'

const URL_FIELDS = ['websiteUrl', 'imprintUrl', 'privacyUrl', 'shareUrl', 'instagramUrl'] as const
const MAX_NAME = 80
const MAX_URL = 500
const MAX_SHARE_TEXT = 300
const MAX_PHONE = 40
const TEXT_FIELDS = ['shareTextEn', 'shareTextDe', 'newsletterTextEn', 'newsletterTextDe'] as const

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
    shareTextDe: stringFor(textValue('shareText'), 'de'),
    newsletterTextEn: stringFor(textValue('newsletterText'), 'en'),
    newsletterTextDe: stringFor(textValue('newsletterText'), 'de'),
    phone: stringFor(textValue('phone'), 'en'),
    instagramUrl: stringFor(textValue('instagramUrl'), 'en')
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
    shareTextDe: get('shareTextDe'),
    newsletterTextEn: get('newsletterTextEn'),
    newsletterTextDe: get('newsletterTextDe'),
    phone: get('phone'),
    instagramUrl: get('instagramUrl')
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

export type ParsedTexts = { ok: true, texts: Record<string, unknown> } | { ok: false, field: keyof BrandTextValues, reason: 'url' | 'length' | 'phone' }

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
  for (const key of TEXT_FIELDS) {
    if (values[key].length > MAX_SHARE_TEXT) return { ok: false, field: key, reason: 'length' }
  }
  if (values.phone.length > MAX_PHONE) return { ok: false, field: 'phone', reason: 'length' }
  if (!/^[+\d\s()/.-]*$/.test(values.phone)) return { ok: false, field: 'phone', reason: 'phone' }
  return {
    ok: true,
    texts: {
      brandName: values.brandName,
      websiteUrl: values.websiteUrl,
      imprintUrl: values.imprintUrl,
      privacyUrl: values.privacyUrl,
      shareUrl: values.shareUrl,
      shareText: { en: values.shareTextEn, de: values.shareTextDe },
      newsletterText: { en: values.newsletterTextEn, de: values.newsletterTextDe },
      phone: values.phone,
      instagramUrl: values.instagramUrl
    }
  }
}

/** What applies when a color is not set on the admin page. */
function fallbackColors (): Record<string, string> {
  return { ...DEFAULT_COLORS, ...folderColors() }
}

export type ParsedColors = { ok: true, colors: BrandColors } | { ok: false, field: string }

/**
 * Validate the colors form. Only colors that differ from the branding folder
 * or the default are kept, so picking the default again means "not set".
 */
export function parseBrandColors (body: Record<string, unknown>): ParsedColors {
  const fallback = fallbackColors()
  const colors: BrandColors = {}
  for (const key of COLOR_KEYS) {
    const value = body?.[key]
    if (!isHexColor(value)) return { ok: false, field: key }
    if (value.toLowerCase() !== fallback[key]) colors[key] = value.toLowerCase()
  }
  return { ok: true, colors }
}

function colorViews (lang: Lang, values?: Record<string, unknown>): ColorView[] {
  const m = t(lang).branding
  const set = brandColors()
  const fallback = fallbackColors()
  return COLOR_KEYS.map(key => {
    const [label, hint] = m.colors[key]
    const posted = values?.[key]
    return {
      key,
      label,
      hint,
      value: isHexColor(posted) ? posted.toLowerCase() : set[key] || fallback[key],
      fallback: fallback[key],
      source: brandColorSource(key)
    }
  })
}

/** Readability warnings for the colors that apply now. */
function contrastWarnings (lang: Lang): string[] {
  const m = t(lang).branding
  const c = { ...DEFAULT_COLORS, ...brandColors() }
  const format = (value: number) => value.toFixed(1).replace('.', lang === 'de' ? ',' : '.')
  const warnings: string[] = []
  const text = contrast(c.text, c.background)
  if (text < 4.5) warnings.push(m.lowContrastText(format(text)))
  const accent = contrast(c.accent, c.background)
  if (accent < 3) warnings.push(m.lowContrastAccent(format(accent)))
  const button = contrast(c.button, c.background)
  if (button < 1.5) warnings.push(m.lowContrastButton(format(button)))
  return warnings
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
  colorValues?: Record<string, unknown>
  colorError?: string
}

function renderBranding (req: Request, res: Response, status: number, options: RenderOptions = {}) {
  const lang = langOf(res)
  const query = req.query as Record<string, unknown>
  const imageNotice = typeof query.hochgeladen === 'string'
    ? { name: query.hochgeladen, kind: 'saved' as const }
    : typeof query.zurueckgesetzt === 'string' ? { name: query.zurueckgesetzt, kind: 'reset' as const } : undefined
  const notice = options.notice || ('gespeichert' in query ? 'saved' : 'texte-zurueckgesetzt' in query ? 'texts-reset' : undefined)
  const colorNotice = 'farben-gespeichert' in query ? 'saved' : 'farben-zurueckgesetzt' in query ? 'reset' : undefined
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
      shareTextDe: sourceOf('shareText'),
      newsletterTextEn: sourceOf('newsletterText'),
      newsletterTextDe: sourceOf('newsletterText'),
      phone: sourceOf('phone'),
      instagramUrl: sourceOf('instagramUrl')
    },
    hasAdminTexts: hasAdminTexts(),
    notice,
    error: options.error,
    colors: colorViews(lang, options.colorValues),
    hasAdminColors: hasAdminColors(),
    colorNotice,
    colorError: options.colorError,
    contrastWarnings: contrastWarnings(lang),
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
        error: parsed.reason === 'url'
          ? m.branding.invalidUrl(label)
          : parsed.reason === 'phone' ? m.branding.invalidPhone : m.branding.tooLong(label)
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

  app.post('/branding/farben', form, (req, res) => {
    const m = t(langOf(res))
    if (!validFormPost(req)) {
      res.status(400).send(m.admin.invalidForm)
      return
    }
    const parsed = parseBrandColors(req.body)
    if (!parsed.ok) {
      renderBranding(req, res, 400, { colorError: m.branding.invalidColor(m.branding.colors[parsed.field][0]) })
      return
    }
    const result = saveBrandColors(parsed.colors)
    if (!result.ok) {
      renderBranding(req, res, 500, { colorValues: req.body, colorError: m.branding.saveFailed })
      return
    }
    log('Admin: brand colors saved')
    res.redirect(303, '/branding?farben-gespeichert#farben')
  })

  app.post('/branding/farben/zuruecksetzen', form, (req, res) => {
    if (!validFormPost(req)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const result = resetBrandColors()
    if (!result.ok) {
      renderBranding(req, res, 500, { colorError: t(langOf(res)).branding.saveFailed })
      return
    }
    log('Admin: brand colors reset')
    res.redirect(303, '/branding?farben-zurueckgesetzt#farben')
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
