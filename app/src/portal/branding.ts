/*
 * Operator branding kept out of the repository and the image: logos, icons
 * and brand texts are read from BRANDING_DIR (default ./branding, i.e.
 * /app/branding in the container). Anything missing there falls back to the
 * neutral defaults in public/brand/ and config.json.
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { log } from '../utils/log'

/** URL prefix of the brand assets. Not versioned: operators swap files without a release. */
export const BRAND = '/share/static/brand'

/** The only files served from the branding folder; branding.json stays private. */
export const BRAND_FILES = ['logo-banner.png', 'logo-light.png', 'icon-192.png', 'apple-touch-icon.png', 'og-image.jpg', 'favicon.ico']

const DEFAULT_DIR = resolve('public/brand')

export function brandingDir (): string {
  return resolve(process.env.BRANDING_DIR || 'branding')
}

let texts: Record<string, unknown> | undefined

/** Contents of branding.json in the branding folder (read once, empty if absent). */
export function brandingTexts (): Record<string, unknown> {
  if (texts) return texts
  let loaded: Record<string, unknown> = {}
  const file = join(brandingDir(), 'branding.json')
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) loaded = parsed
    } catch (e) {
      log.warn('Ignoring ' + file + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  texts = loaded
  return loaded
}

/** Forget the cached branding.json (tests). */
export function resetBrandingCache () {
  texts = undefined
}

/** Send a brand file: the operator's version if present, else the neutral default. */
export function sendBrandFile (res: Response, name: string) {
  const custom = brandingDir()
  const root = existsSync(join(custom, name)) ? custom : DEFAULT_DIR
  res.sendFile(name, { root, maxAge: '1d' })
}

/** Route handler for `${BRAND}/:file`. */
export function brandAsset (req: Request, res: Response, next: NextFunction) {
  const name = req.params.file
  if (!BRAND_FILES.includes(name)) return next()
  sendBrandFile(res, name)
}
