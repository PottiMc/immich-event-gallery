/*
 * Settings changed on the admin page. They are stored as settings.json in
 * DATA_DIR (default ./data, i.e. /app/data in the container, a writable
 * volume) and laid over the loaded config.json at startup and after every
 * change. The upstream code reads the config per request, so a change takes
 * effect immediately without a restart.
 */

import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { getConfigOption } from '../config/access'
import { getCurrentConfig } from '../config/loader'
import { log } from '../utils/log'

/** Download tiers offered on the admin page (`fullsize` stays a config.json-only option). */
export type DownloadQuality = 'original' | 'preview'

export interface RuntimeSettings {
  downloadQuality?: DownloadQuality
}

export type SaveResult = { ok: true } | { ok: false, message: string }

let current: RuntimeSettings = {}

export function dataDir (): string {
  return resolve(process.env.DATA_DIR || 'data')
}

function settingsFile (): string {
  return join(dataDir(), 'settings.json')
}

export function isDownloadQuality (value: unknown): value is DownloadQuality {
  return value === 'original' || value === 'preview'
}

/** Keep only known keys with valid values. */
function sanitize (raw: unknown): RuntimeSettings {
  const settings: RuntimeSettings = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = (raw as Record<string, unknown>).downloadQuality
    if (isDownloadQuality(value)) settings.downloadQuality = value
  }
  return settings
}

/** Lay the runtime settings over the loaded config. */
function apply () {
  if (!current.downloadQuality) return
  const config = getCurrentConfig()
  if (!config.ipp || typeof config.ipp !== 'object') config.ipp = {}
  ;(config.ipp as Record<string, unknown>).maxDownloadQuality = current.downloadQuality
}

/** Read settings.json (if present) and apply it. Call once after loadConfig(). */
export function loadRuntimeSettings (): RuntimeSettings {
  current = {}
  const file = settingsFile()
  if (existsSync(file)) {
    try {
      current = sanitize(JSON.parse(readFileSync(file, 'utf8')))
    } catch (e) {
      log.warn('Ignoring ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  apply()
  return { ...current }
}

/**
 * Change settings. They apply at once; if the data folder is not writable they
 * still apply until the next restart, and the result says so.
 */
export function saveRuntimeSettings (patch: RuntimeSettings): SaveResult {
  current = { ...current, ...sanitize(patch) }
  apply()
  const file = settingsFile()
  try {
    mkdirSync(dataDir(), { recursive: true })
    // Write-then-rename, so a crash never leaves a half-written file behind
    writeFileSync(file + '.tmp', JSON.stringify(current, null, 2) + '\n', 'utf8')
    renameSync(file + '.tmp', file)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.warn('Could not save ' + file + ': ' + message)
    return { ok: false, message }
  }
}

/** Whether settings survive a restart (the data folder exists and is writable). */
export function settingsPersistent (): boolean {
  try {
    accessSync(dataDir(), constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** The effective download tier, whether it came from the admin page or config.json. */
export function downloadQuality (): DownloadQuality {
  return getConfigOption('ipp.maxDownloadQuality', 'original') === 'preview' ? 'preview' : 'original'
}
