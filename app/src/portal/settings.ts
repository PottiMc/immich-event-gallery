/*
 * Portal settings.
 *
 * Secrets and deployment values come from environment variables (see
 * .env.example). Brand texts come from branding.json in the branding folder
 * (see branding.ts), then from config.json under `portal`, then from
 * the neutral defaults below.
 */

import crypto from 'crypto'
import { getConfigOption, getNumericConfigOption } from '../config/access'
import { log } from '../utils/log'
import { brandingTexts } from './branding'

let fallbackSecret: Buffer | undefined

/**
 * The master secret. Everything that must survive a container restart
 * (session cookies, QR access tokens) is derived from it. Without
 * PORTAL_SECRET a random one is generated, which works but logs every guest
 * out and invalidates all printed QR codes on each restart.
 */
function masterSecret (): Buffer {
  const env = process.env.PORTAL_SECRET
  if (env && env.length >= 32) return Buffer.from(env, 'utf8')
  if (!fallbackSecret) {
    log.warn('PORTAL_SECRET is missing or shorter than 32 characters - using a random secret. ' +
      'QR codes and guest sessions will stop working after a restart.')
    fallbackSecret = crypto.randomBytes(32)
  }
  return fallbackSecret
}

/**
 * Derive a purpose-specific 32-byte key from the master secret, so the same
 * secret never gets reused directly for two different jobs.
 */
export function deriveKey (purpose: string): Buffer {
  return crypto.createHmac('sha256', masterSecret()).update('portal:' + purpose).digest()
}

export function immichApiKey (): string {
  return process.env.IMMICH_API_KEY || ''
}

export function adminPassword (): string {
  return process.env.PORTAL_ADMIN_PASSWORD || ''
}

export function adminPort (): number {
  return Number(process.env.PORTAL_ADMIN_PORT) || 3001
}

/**
 * Express `trust proxy` value. Default trusts private networks, which is where
 * a reverse proxy or tunnel client in front of the container connects from.
 */
export function trustProxy (): boolean | number | string {
  const v = process.env.TRUST_PROXY
  if (v === undefined || v === '') return 'loopback, linklocal, uniquelocal'
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

/** How long a guest stays logged in after entering the password. */
export function sessionDays (): number {
  return Math.max(1, getNumericConfigOption('portal.sessionDays', 14))
}

function brandOption (key: string, fallback: string): string {
  const value = brandingTexts()[key]
  if (typeof value === 'string') return value
  return String(getConfigOption('portal.' + key, fallback))
}

export function brandName (): string {
  return brandOption('brandName', 'Bilder-Portal')
}

/** Footer links; an empty value hides the link. */
export function websiteUrl (): string {
  return brandOption('websiteUrl', '')
}

export function imprintUrl (): string {
  return brandOption('imprintUrl', '')
}

export function privacyUrl (): string {
  return brandOption('privacyUrl', '')
}

/**
 * Public source code of this fork. The AGPL-3.0 licence of Immich Public Proxy
 * requires offering the source to everyone using the service over a network.
 */
export function sourceUrl (): string {
  return brandOption('sourceUrl', 'https://github.com/PottiMc/immich-event-gallery')
}

/**
 * Default text for the WhatsApp / share button. Placeholders:
 * {titel} album title, {nr} image number, {anzahl} total images.
 * Can be overridden per album with a line "Teilen: ..." in the album description.
 */
export function shareTextTemplate (): string {
  return brandOption('shareText', 'Das war „{titel}“ – Bild {nr} von {anzahl}')
}

/** Link appended to shared images (marketing link, not the album); empty = none. */
export function shareUrl (): string {
  return brandOption('shareUrl', websiteUrl())
}

/**
 * Fully-qualified public URL of the portal, used for QR codes and og:image.
 */
export function publicBaseUrl (fallbackHost?: string, fallbackProtocol = 'https'): string {
  const env = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (env) return env
  return fallbackHost ? `${fallbackProtocol}://${fallbackHost}` : ''
}

/** Display form of the portal address, e.g. "bilder.example.com". */
export function publicHostLabel (base: string): string {
  return base.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}
