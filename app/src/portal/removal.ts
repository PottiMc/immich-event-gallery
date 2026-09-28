/*
 * Removal requests: a guest picks photos in the gallery and asks the operator
 * to take them down for privacy reasons. The request goes out as an e-mail
 * over SMTP to REMOVAL_REQUEST_TO; nothing is changed in Immich. The feature
 * is off (no button, route answers 404) unless SMTP_HOST and
 * REMOVAL_REQUEST_TO are set.
 *
 * To keep it for real privacy cases, the guest has to pick one of a few
 * privacy reasons, explain it, leave a name and e-mail address and confirm
 * that it is not about how they look. Each IP may send a few requests per
 * hour, and all guests together a few dozen.
 */

import dayjs from 'dayjs'
import nodemailer, { Transporter } from 'nodemailer'
import { Request, Response } from 'express-serve-static-core'
import { fetchAssetDetail } from '../immich'
import { dateSortComparator, groupByDateMode } from '../gallery/builder'
import { title } from '../share'
import { Asset, SharedLink } from '../types'
import { createLimiter } from '../utils/limiter'
import { log } from '../utils/log'
import { isLang } from '../shared/i18n'
import { defaultLang, Lang, langOf, t } from './i18n'
import { clientIp, throttleKey } from './security'
import { LoginThrottle } from './throttle'

export const REMOVAL_REASONS = ['self', 'child', 'sensitive', 'other'] as const
export type RemovalReason = typeof REMOVAL_REASONS[number]

export const MAX_PHOTOS = 50
export const MIN_DETAILS = 20
const MAX_DETAILS = 2000
const MAX_NAME = 100
const MAX_EMAIL = 200

// Every sent request counts as a "failure": 3 per IP and hour, 30 in total
function newThrottle () {
  return new LoginThrottle({
    maxFailures: 3,
    windowMs: 60 * 60_000,
    blockMs: 60 * 60_000,
    maxBlockMs: 24 * 60 * 60_000,
    globalMaxFailures: 30,
    globalBlockMs: 60 * 60_000
  })
}
let removalThrottle = newThrottle()

/** For tests. */
export function resetRemovalThrottle () {
  removalThrottle = newThrottle()
}

export function removalRequestsEnabled (): boolean {
  return !!(process.env.SMTP_HOST && process.env.REMOVAL_REQUEST_TO)
}

/** Language of the e-mail to the operator. */
function mailLang (): Lang {
  const lang = process.env.REMOVAL_REQUEST_LANG
  return isLang(lang) ? lang : defaultLang()
}

export interface RemovalRequest {
  assetIds: string[]
  reason: RemovalReason
  details: string
  name: string
  email: string
}

export type RemovalError = 'invalid' | 'tooMany'

// Deliberately simple: one @, no spaces or line breaks, a dot in the domain
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text (value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Check a request body against the share. Only photos of this share are
 * accepted; unknown IDs are dropped.
 */
export function parseRemovalRequest (body: unknown, link: SharedLink):
  { ok: true, value: RemovalRequest } | { ok: false, error: RemovalError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (!Array.isArray(b.assets)) return { ok: false, error: 'invalid' }
  const requested = new Set(b.assets.filter((id): id is string => typeof id === 'string'))
  if (requested.size > MAX_PHOTOS) return { ok: false, error: 'tooMany' }
  const assetIds = link.assets.filter(a => requested.has(a.id)).map(a => a.id)

  const reason = REMOVAL_REASONS.find(r => r === b.reason)
  const details = text(b.details, MAX_DETAILS)
  const name = text(b.name, MAX_NAME)
  const email = text(b.email, MAX_EMAIL)
  if (!assetIds.length || !reason || details.length < MIN_DETAILS || name.length < 2 ||
    !EMAIL.test(email) || b.confirm !== true) {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true, value: { assetIds, reason, details, name, email } }
}

export interface RemovalMailContext {
  // Selected photos with their position in the gallery ("photo 12 of 48")
  photos: Array<{ asset: Asset, number: number }>
  total: number
  albumTitle: string
  guestLang: Lang
  ip: string
  sentAt: Date
}

/** "2026-09-24 15:32" from Immich's local wall-clock timestamp. */
function takenAt (asset: Asset): string {
  const value = asset.localDateTime || asset.fileCreatedAt || ''
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value) ? value.slice(0, 16).replace('T', ' ') : ''
}

/** Plain-text e-mail to the operator. */
export function removalMail (request: RemovalRequest, ctx: RemovalMailContext, lang: Lang = mailLang()) {
  const m = t(lang).removal
  const immichUrl = (process.env.IMMICH_ADMIN_URL || '').replace(/\/+$/, '')
  const photoLines = ctx.photos.flatMap(({ asset, number }) => {
    const parts = [m.mailPhotoOf(number, ctx.total), asset.originalFileName, takenAt(asset)].filter(Boolean)
    return [
      '  • ' + parts.join(' – '),
      '    ' + (immichUrl ? `${immichUrl}/photos/${asset.id}` : 'ID ' + asset.id)
    ]
  })
  const lines = [
    m.mailIntro,
    '',
    `${m.mailAlbum}: ${ctx.albumTitle}`,
    '',
    `${m.mailPhotos} (${ctx.photos.length}):`,
    ...photoLines,
    '',
    `${m.mailReason}: ${m.reasons[request.reason]}`,
    `${m.mailDetails}:`,
    request.details,
    '',
    `${m.mailName}: ${request.name}`,
    `${m.mailEmail}: ${request.email} ${m.mailReplyHint}`,
    '',
    '--',
    `${m.mailSent}: ${dayjs(ctx.sentAt).format(t(lang).dateFormat + ' HH:mm')} · ` +
      `${m.mailGuestLang}: ${ctx.guestLang} · IP: ${ctx.ip}`
  ]
  return { subject: m.mailSubject, text: lines.join('\n') }
}

type Transport = Pick<Transporter, 'sendMail'>
let transport: Transport | undefined

/** Tests swap in a fake transport. */
export function setRemovalTransport (fake: Transport | undefined) {
  transport = fake
}

function smtpTransport (): Transport {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465
    const user = process.env.SMTP_USER
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: user ? { user, pass: process.env.SMTP_PASS || '' } : undefined
    })
  }
  return transport
}

/** The photos in gallery order with their numbers, filenames loaded where missing. */
async function selectedPhotos (link: SharedLink, ids: string[]) {
  const ordered = [...link.assets]
  const grouping = groupByDateMode()
  if (grouping) ordered.sort(dateSortComparator(link.album?.order))
  const wanted = new Set(ids)
  const limit = createLimiter(4)
  const photos = await Promise.all(ordered
    .map((asset, index) => ({ asset, number: index + 1 }))
    .filter(p => wanted.has(p.asset.id))
    .map(p => limit(async () => {
      // Album grid items carry no filename; ask Immich (cached)
      if (p.asset.originalFileName) return p
      const detail = await fetchAssetDetail(p.asset).catch(() => undefined)
      return detail ? { ...p, asset: { ...p.asset, ...detail } } : p
    })))
  return { photos, total: ordered.length }
}

/**
 * [ROUTE] POST /share/:key/removal-request (JSON). The share is already
 * resolved and unlocked by the caller.
 */
export async function handleRemovalRequest (req: Request, res: Response, link: SharedLink) {
  res.header('Cache-Control', 'no-store')
  const m = t(langOf(res)).removal
  if (!removalRequestsEnabled()) {
    res.status(404).json({ error: m.errorSend })
    return
  }
  // JSON from our own page only (a cross-site JSON post needs CORS approval)
  const site = req.get('sec-fetch-site')
  if (!req.is('application/json') || (site && site !== 'same-origin')) {
    res.status(400).json({ error: m.errorInvalid })
    return
  }

  const ip = throttleKey(clientIp(req))
  const gate = removalThrottle.check(ip)
  if (!gate.allowed) {
    res.status(429).json({ error: m.throttled(t(langOf(res)).wait(gate.retryAfterSec)) })
    return
  }

  const parsed = parseRemovalRequest(req.body, link)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error === 'tooMany' ? m.errorTooMany(MAX_PHOTOS) : m.errorInvalid })
    return
  }

  const { photos, total } = await selectedPhotos(link, parsed.value.assetIds)
  const mail = removalMail(parsed.value, {
    photos,
    total,
    albumTitle: title(link),
    guestLang: langOf(res),
    ip,
    sentAt: new Date()
  })
  try {
    await smtpTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.REMOVAL_REQUEST_TO,
      replyTo: parsed.value.email,
      subject: mail.subject,
      text: mail.text
    })
  } catch (e) {
    log.error('Removal request could not be sent: ' + (e instanceof Error ? e.message : String(e)))
    res.status(502).json({ error: m.errorSend })
    return
  }
  removalThrottle.fail(ip)
  log('Portal: removal request for ' + photos.length + ' photo(s) of link ' + (link.id || '?') + ' from ' + ip)
  res.json({ ok: true })
}
