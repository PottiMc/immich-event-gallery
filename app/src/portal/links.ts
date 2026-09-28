/*
 * Password → shared-link lookup.
 *
 * Immich stores shared-link passwords and returns them to the owner via
 * `GET /api/shared-links` (API key with the `sharedLink.read` permission).
 * The portal lists all links, and when a guest types a password it looks for
 * the link with that password. No extra config needed: create a shared link
 * with a password in Immich and it is live on the portal.
 */

import crypto from 'crypto'
import dayjs from 'dayjs'
import { apiUrl } from '../immich'
import { log } from '../utils/log'
import { immichApiKey } from './settings'
import { accessToken } from './tokens'

export interface PortalLink {
  id: string
  key: string
  slug: string | null
  password: string | null
  description: string | null
  type: 'ALBUM' | 'INDIVIDUAL' | string
  createdAt: string
  expiresAt: string | null
  allowDownload: boolean
  assets?: unknown[]
  album?: {
    id: string
    albumName?: string
    description?: string
    assetCount?: number
  }
}

export type LinkListResult =
  | { ok: true, links: PortalLink[] }
  | { ok: false, status: number, message: string }

const LIST_TTL_MS = 20_000
let cache: { at: number, promise: Promise<LinkListResult> } | undefined

/**
 * All shared links of the API key's owner, cached for a few seconds.
 * `maxAgeMs` lets a caller demand fresher data (e.g. after a failed password
 * lookup, so a link created seconds ago is found).
 */
export function listSharedLinks (maxAgeMs = LIST_TTL_MS): Promise<LinkListResult> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.promise
  const promise = fetchSharedLinks()
  const entry = { at: Date.now(), promise }
  cache = entry
  promise.then(result => {
    // Never keep an error around longer than necessary
    if (!result.ok && cache === entry) cache = undefined
  }, () => { if (cache === entry) cache = undefined })
  return promise
}

async function fetchSharedLinks (): Promise<LinkListResult> {
  const apiKey = immichApiKey()
  if (!apiKey) {
    return { ok: false, status: 0, message: 'IMMICH_API_KEY ist nicht gesetzt.' }
  }
  try {
    const res = await fetch(apiUrl() + '/shared-links', {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' }
    })
    if (res.status !== 200) {
      const body = (await res.text()).slice(0, 300)
      log.warn('Listing shared links failed with status ' + res.status + ': ' + body)
      const message = res.status === 401 || res.status === 403
        ? 'Immich lehnt den API-Key ab. Prüfe den Key und das Recht „sharedLink.read“.'
        : 'Immich antwortet mit Status ' + res.status + '.'
      return { ok: false, status: res.status, message }
    }
    const links = await res.json() as PortalLink[]
    return { ok: true, links: Array.isArray(links) ? links : [] }
  } catch (e) {
    log.warn('Listing shared links failed: ' + (e instanceof Error ? e.message : String(e)))
    return { ok: false, status: 0, message: 'Immich ist nicht erreichbar (' + apiUrl() + ').' }
  }
}

export function isExpired (link: PortalLink, now = dayjs()): boolean {
  return !!link.expiresAt && dayjs(link.expiresAt).isBefore(now)
}

/** Links a guest can reach through the portal password field. */
export function portalLinks (links: PortalLink[]): PortalLink[] {
  return links.filter(link => !!link.password && !isExpired(link))
}

export function linkTitle (link: PortalLink): string {
  return link.description || link.album?.albumName || 'Galerie'
}

/**
 * Normalise a password for comparison: case, whitespace, hyphens, underscores
 * and dots are ignored, so "Riesling-Karaffe 4827" matches "riesling karaffe-4827".
 * Guests type on phones with auto-capitalisation - this saves a lot of frustration.
 */
export function normalizePassword (input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '')
}

function digest (value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time comparison of a stored link password with a guest's input. */
export function passwordEquals (stored: string, input: string): boolean {
  const wanted = normalizePassword(input)
  if (!wanted) return false
  return crypto.timingSafeEqual(digest(normalizePassword(stored)), digest(wanted))
}

/**
 * Find the link whose password matches `input`. Comparison is constant-time per
 * link. If two links share a password, the newest one wins (the admin page
 * warns about duplicates).
 */
export function matchPassword (links: PortalLink[], input: string): PortalLink | undefined {
  if (!normalizePassword(input)) return undefined
  let best: PortalLink | undefined
  for (const link of portalLinks(links)) {
    if (passwordEquals(link.password || '', input)) {
      if (!best || link.createdAt > best.createdAt) best = link
    }
  }
  return best
}

export function matchAccessToken (links: PortalLink[], token: string): PortalLink | undefined {
  if (!/^[\w-]{24}$/.test(token)) return undefined
  const wanted = Buffer.from(token)
  return portalLinks(links).find(link => {
    const candidate = Buffer.from(accessToken(link.key, link.password || ''))
    return candidate.length === wanted.length && crypto.timingSafeEqual(candidate, wanted)
  })
}

/** Groups of links whose passwords collide after normalisation. */
export function duplicatePasswords (links: PortalLink[]): Set<string> {
  const seen = new Map<string, number>()
  for (const link of portalLinks(links)) {
    const n = normalizePassword(link.password || '')
    seen.set(n, (seen.get(n) || 0) + 1)
  }
  const dupes = new Set<string>()
  for (const link of portalLinks(links)) {
    if ((seen.get(normalizePassword(link.password || '')) || 0) > 1) dupes.add(link.id)
  }
  return dupes
}

/**
 * Rough strength check for the admin page. With the rate limits in place,
 * ~10+ normalised characters mixing words and digits is plenty.
 */
export function isWeakPassword (password: string): boolean {
  const n = normalizePassword(password)
  return n.length < 10 || !/\d/.test(n) || !/[a-zäöüß]/.test(n)
}
