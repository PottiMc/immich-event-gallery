/*
 * Protection for the admin page's forms and uploads. The browser may send the
 * session cookie (or cached Basic Auth credentials) on cross-site requests
 * too, so every change must prove it came from our own page.
 */

import crypto from 'crypto'
import { Request } from 'express-serve-static-core'
import { deriveKey } from './settings'

function sha256 (value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time comparison of two strings. */
export function safeEquals (a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b))
}

/** Token for the admin forms. */
export function adminFormToken (): string {
  return deriveKey('admin-form').toString('hex')
}

/**
 * Whether a POST came from the admin page: the token from the form field
 * `csrf` or the header `X-CSRF-Token` (uploads), plus Sec-Fetch-Site where the
 * browser sends it.
 */
export function validFormPost (req: Request): boolean {
  const site = req.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const token = typeof req.body?.csrf === 'string' ? req.body.csrf : (req.get('x-csrf-token') || '')
  return safeEquals(token, adminFormToken())
}
