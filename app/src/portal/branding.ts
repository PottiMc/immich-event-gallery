/*
 * Operator branding kept out of the repository and the image: logos, icons
 * and brand texts. Three layers, first match wins:
 *
 *   1. set on the admin page: DATA_DIR/branding/ (the writable data volume)
 *   2. the branding folder: BRANDING_DIR (default ./branding, i.e.
 *      /app/branding in the container, usually mounted read-only)
 *   3. the neutral defaults in public/brand/ and config.json
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { log } from '../utils/log'
import { dataDir } from './runtime-settings'

/** URL prefix of the brand assets. Not versioned by release: see brandUrl(). */
export const BRAND = '/share/static/brand'

export type ImageFormat = 'png' | 'jpeg' | 'ico'

export interface BrandSlot {
  name: string
  /** Accepted file formats, first one is the intended one */
  formats: ImageFormat[]
  /** Recommended size in pixels */
  width: number
  height: number
}

/** The only files served from the branding folders; branding.json stays private. */
export const BRAND_SLOTS: BrandSlot[] = [
  { name: 'logo-banner.png', formats: ['png'], width: 732, height: 283 },
  { name: 'logo-light.png', formats: ['png'], width: 484, height: 700 },
  { name: 'icon-192.png', formats: ['png'], width: 192, height: 192 },
  { name: 'apple-touch-icon.png', formats: ['png'], width: 180, height: 180 },
  { name: 'og-image.jpg', formats: ['jpeg'], width: 1200, height: 630 },
  { name: 'favicon.ico', formats: ['ico', 'png'], width: 48, height: 48 }
]

export const BRAND_FILES = BRAND_SLOTS.map(slot => slot.name)

/** Largest image accepted on the admin page. */
export const MAX_BRAND_FILE_BYTES = 5 * 1024 * 1024

export type BrandSource = 'admin' | 'folder' | 'default'

const DEFAULT_DIR = resolve('public/brand')

export function brandingDir (): string {
  return resolve(process.env.BRANDING_DIR || 'branding')
}

/** Where the admin page stores its branding (inside the writable data folder). */
export function adminBrandingDir (): string {
  return join(dataDir(), 'branding')
}

function adminTextsFile (): string {
  return join(adminBrandingDir(), 'branding.json')
}

function readJsonObject (file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch (e) {
    log.warn('Ignoring ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
  }
  return {}
}

interface TextLayers {
  admin: Record<string, unknown>
  folder: Record<string, unknown>
  merged: Record<string, unknown>
}

let layers: TextLayers | undefined

function textLayers (): TextLayers {
  if (!layers) {
    const admin = readJsonObject(adminTextsFile())
    const folder = readJsonObject(join(brandingDir(), 'branding.json'))
    layers = { admin, folder, merged: { ...folder, ...admin } }
  }
  return layers
}

/** Brand texts: the admin page's values over the branding folder's branding.json (read once, empty if absent). */
export function brandingTexts (): Record<string, unknown> {
  return textLayers().merged
}

/** Where a brand text comes from. */
export function brandTextSource (key: string): BrandSource {
  const { admin, folder } = textLayers()
  if (key in admin) return 'admin'
  if (key in folder) return 'folder'
  return 'default'
}

/** Whether texts were saved on the admin page. */
export function hasAdminTexts (): boolean {
  return Object.keys(textLayers().admin).length > 0
}

/** Forget the cached texts (tests, and after a change on the admin page). */
export function resetBrandingCache () {
  layers = undefined
}

function writeAtomic (file: string, data: string | Buffer) {
  mkdirSync(adminBrandingDir(), { recursive: true })
  // Write-then-rename, so a crash never leaves a half-written file behind
  writeFileSync(file + '.tmp', data)
  renameSync(file + '.tmp', file)
}

export type StoreResult = { ok: true } | { ok: false, message: string }

function store (action: () => void, what: string): StoreResult {
  try {
    action()
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.warn('Could not ' + what + ': ' + message)
    return { ok: false, message }
  } finally {
    resetBrandingCache()
  }
}

/** Replace the texts set on the admin page (already validated). */
export function saveBrandTexts (texts: Record<string, unknown>): StoreResult {
  return store(() => writeAtomic(adminTextsFile(), JSON.stringify(texts, null, 2) + '\n'), 'save the brand texts')
}

/** Drop the texts set on the admin page, so the branding folder and defaults apply again. */
export function resetBrandTexts (): StoreResult {
  return store(() => { if (existsSync(adminTextsFile())) unlinkSync(adminTextsFile()) }, 'reset the brand texts')
}

/** Folder that currently provides a brand file. */
function brandFileRoot (name: string): { root: string, source: BrandSource } {
  if (existsSync(join(adminBrandingDir(), name))) return { root: adminBrandingDir(), source: 'admin' }
  if (existsSync(join(brandingDir(), name))) return { root: brandingDir(), source: 'folder' }
  return { root: DEFAULT_DIR, source: 'default' }
}

export function brandFileSource (name: string): BrandSource {
  return brandFileRoot(name).source
}

/** The brand file's current content (for size checks on the admin page). */
export function readBrandFile (name: string): Buffer | undefined {
  try {
    return readFileSync(join(brandFileRoot(name).root, name))
  } catch {
    return undefined
  }
}

/**
 * URL of a brand file with a version derived from the file, so browsers load
 * a new logo right after it changes instead of keeping the old one for a day.
 */
export function brandUrl (name: string): string {
  const { root } = brandFileRoot(name)
  try {
    return `${BRAND}/${name}?v=${Math.floor(statSync(join(root, name)).mtimeMs).toString(36)}`
  } catch {
    return `${BRAND}/${name}`
  }
}

export interface ImageInfo {
  format: ImageFormat
  width?: number
  height?: number
}

/** Recognise PNG, JPEG and ICO by their first bytes and read the pixel size. */
export function imageInfo (buf: Buffer): ImageInfo | undefined {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    // Walk the segments up to the first start-of-frame marker
    let i = 2
    while (i + 9 < buf.length && buf[i] === 0xff) {
      const marker = buf[i + 1]
      const length = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
      }
      i += 2 + length
    }
    return { format: 'jpeg' }
  }
  if (buf.length >= 22 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1 && buf.readUInt16LE(4) > 0) {
    // Size of the first icon in the file; 0 stands for 256
    return { format: 'ico', width: buf[6] || 256, height: buf[7] || 256 }
  }
  return undefined
}

export function brandSlot (name: string): BrandSlot | undefined {
  return BRAND_SLOTS.find(slot => slot.name === name)
}

export type BrandFileResult = { ok: true, info: ImageInfo } | { ok: false, error: 'type' | 'size' | 'write', message?: string }

/** Store an uploaded image for a slot after checking its format and size. */
export function saveBrandFile (name: string, data: Buffer): BrandFileResult {
  const slot = brandSlot(name)
  if (!slot) return { ok: false, error: 'type' }
  if (data.length > MAX_BRAND_FILE_BYTES) return { ok: false, error: 'size' }
  const info = imageInfo(data)
  if (!info || !slot.formats.includes(info.format)) return { ok: false, error: 'type' }
  const result = store(() => writeAtomic(join(adminBrandingDir(), name), data), 'save ' + name)
  return result.ok ? { ok: true, info } : { ok: false, error: 'write', message: result.message }
}

/** Remove an image uploaded on the admin page, so the branding folder or default applies again. */
export function resetBrandFile (name: string): StoreResult {
  if (!brandSlot(name)) return { ok: false, message: 'unknown file' }
  const file = join(adminBrandingDir(), name)
  return store(() => { if (existsSync(file)) unlinkSync(file) }, 'reset ' + name)
}

/** Send a brand file: the admin page's upload, else the branding folder's, else the neutral default. */
export function sendBrandFile (res: Response, name: string) {
  res.sendFile(name, { root: brandFileRoot(name).root, maxAge: '1d' })
}

/** Route handler for `${BRAND}/:file`. */
export function brandAsset (req: Request, res: Response, next: NextFunction) {
  const name = req.params.file
  if (!BRAND_FILES.includes(name)) return next()
  sendBrandFile(res, name)
}
