/*
 * Visit and download statistics for the admin page. Only daily counters per
 * share are stored (stats.json in DATA_DIR) - no IP addresses, user agents or
 * cookies. Unique visitors are told apart with a salted hash that lives in
 * memory only; the salt changes every day, so nobody can be recognised across
 * days, and a restart forgets everything but the counters.
 */

import crypto from 'crypto'
import dayjs from 'dayjs'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Request } from 'express-serve-static-core'
import { log } from '../utils/log'
import { dataDir } from './runtime-settings'
import { clientIp, throttleKey } from './security'

export interface DayCounts {
  /** Gallery visitors, each counted once per day and share */
  visitors: number
  /** Gallery page loads */
  views: number
  /** Downloaded files, single downloads and files in ZIPs */
  downloads: number
  /** ZIP downloads ("download all" or a selection) */
  zips: number
  /** Logins with the password (landing page or password page) */
  logins: number
  /** Logins through a QR code or access link */
  qr: number
}

export type Metric = keyof DayCounts

export interface ShareStats {
  /** Last known title, so the stats still make sense after the share is deleted */
  title: string
  days: Record<string, Partial<DayCounts>>
}

export const METRICS: Metric[] = ['visitors', 'views', 'downloads', 'zips', 'logins', 'qr']

/** Days older than this are dropped when the file is loaded. */
const KEEP_DAYS = 730
const SAVE_DELAY_MS = 30_000

let shares: Record<string, ShareStats> | undefined
let dirty = false
let saveTimer: NodeJS.Timeout | undefined
let exitHookInstalled = false

// Unique-visitor bookkeeping for the current day, memory only
let seenDay = ''
let seenSalt = Buffer.alloc(0)
let seen = new Set<string>()

/*
 * Link previews (WhatsApp, Telegram, ...), crawlers and scripts are not guests.
 * They matter mostly for /z/ access links, which open without a password.
 */
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|embedly|curl|wget|python|headless|lighthouse/i

export function today (): string {
  return dayjs().format('YYYY-MM-DD')
}

function statsFile (): string {
  return join(dataDir(), 'stats.json')
}

function isCountable (req: Request): boolean {
  const agent = req.headers['user-agent']
  return typeof agent === 'string' && agent.length > 0 && !BOT_PATTERN.test(agent)
}

function sanitize (raw: unknown): Record<string, ShareStats> {
  const result: Record<string, ShareStats> = {}
  const input = raw && typeof raw === 'object' ? (raw as { shares?: unknown }).shares : undefined
  if (!input || typeof input !== 'object') return result
  const oldest = dayjs().subtract(KEEP_DAYS, 'day').format('YYYY-MM-DD')
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as { title?: unknown, days?: unknown }
    const days: Record<string, Partial<DayCounts>> = {}
    if (entry.days && typeof entry.days === 'object') {
      for (const [day, counts] of Object.entries(entry.days as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < oldest || !counts || typeof counts !== 'object') continue
        const clean: Partial<DayCounts> = {}
        for (const metric of METRICS) {
          const n = (counts as Record<string, unknown>)[metric]
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) clean[metric] = Math.floor(n)
        }
        days[day] = clean
      }
    }
    result[id] = { title: typeof entry.title === 'string' ? entry.title : '', days }
  }
  return result
}

function load (): Record<string, ShareStats> {
  if (shares) return shares
  shares = {}
  const file = statsFile()
  if (existsSync(file)) {
    try {
      shares = sanitize(JSON.parse(readFileSync(file, 'utf8')))
    } catch (e) {
      log.warn('Ignoring ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  if (!exitHookInstalled) {
    exitHookInstalled = true
    // Runs on process.exit (SIGTERM handler, crash) - write what is pending
    process.on('exit', () => { flushStats() })
  }
  return shares
}

/** Write pending counts now. Safe to call at any time. */
export function flushStats (): boolean {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (!dirty || !shares) return true
  const file = statsFile()
  try {
    mkdirSync(dataDir(), { recursive: true })
    // Write-then-rename, so a crash never leaves a half-written file behind
    writeFileSync(file + '.tmp', JSON.stringify({ version: 1, shares }) + '\n', 'utf8')
    renameSync(file + '.tmp', file)
    dirty = false
    return true
  } catch (e) {
    log.warn('Could not save ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    return false
  }
}

function scheduleSave () {
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(flushStats, SAVE_DELAY_MS)
  saveTimer.unref()
}

function add (shareId: string | undefined, title: string | undefined, metric: Metric, amount = 1) {
  if (!shareId || amount <= 0) return
  const all = load()
  const entry = all[shareId] ?? (all[shareId] = { title: '', days: {} })
  if (title) entry.title = title
  const day = entry.days[today()] ?? (entry.days[today()] = {})
  day[metric] = (day[metric] || 0) + amount
  scheduleSave()
}

/** True the first time this visitor opens this share today. */
function firstVisitToday (req: Request, shareId: string): boolean {
  const day = today()
  if (day !== seenDay) {
    seenDay = day
    seenSalt = crypto.randomBytes(32)
    seen = new Set()
  }
  const visitor = crypto.createHmac('sha256', seenSalt)
    .update(shareId + '\n' + throttleKey(clientIp(req)) + '\n' + (req.headers['user-agent'] || ''))
    .digest('base64url')
    .slice(0, 22)
  if (seen.has(visitor)) return false
  seen.add(visitor)
  return true
}

interface StatsLink {
  id?: string
  description?: string | null
  album?: { albumName?: string }
}

function titleOf (link: StatsLink): string | undefined {
  return link.description || link.album?.albumName || undefined
}

/** A guest opened the gallery of a share. */
export function recordView (req: Request, link: StatsLink) {
  if (!link.id || !isCountable(req)) return
  add(link.id, titleOf(link), 'views')
  if (firstVisitToday(req, link.id)) add(link.id, undefined, 'visitors')
}

/** A guest logged in with the password or through a QR code / access link. */
export function recordLogin (req: Request, link: StatsLink, via: 'password' | 'qr') {
  if (!isCountable(req)) return
  add(link.id, titleOf(link), via === 'qr' ? 'qr' : 'logins')
}

/** A guest downloaded files: a single file, or a ZIP with `files` entries. */
export function recordDownload (req: Request, link: StatsLink, files: number, zip: boolean) {
  if (!link.id || !isCountable(req)) return
  add(link.id, titleOf(link), 'downloads', files)
  if (zip) add(link.id, undefined, 'zips')
}

/** All counters by share id. Treat as read-only. */
export function allStats (): Record<string, ShareStats> {
  return load()
}

/** Forget the statistics of one share (e.g. after it was deleted in Immich). */
export function deleteShareStats (shareId: string): boolean {
  const all = load()
  if (!all[shareId]) return false
  delete all[shareId]
  dirty = true
  return flushStats()
}

/** Tests: drop the in-memory state so the next call reads DATA_DIR again. */
export function resetStatsForTests () {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  shares = undefined
  dirty = false
  seenDay = ''
  seen = new Set()
}
