/*
 * Security headers and client identification for the guest and admin apps.
 */

import net from 'net'
import { NextFunction, Request, Response } from 'express-serve-static-core'

/*
 * No inline scripts anywhere (they live in public/portal/*.js), so
 * script-src can stay at 'self'. Styles allow 'unsafe-inline' because
 * PhotoSwipe sets style attributes. img-src needs data: for the thumbhash
 * placeholders.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ')

export function securityHeaders (req: Request, res: Response, next: NextFunction) {
  res.set('Content-Security-Policy', CSP)
  res.set('X-Frame-Options', 'DENY')
  res.set('X-Content-Type-Options', 'nosniff')
  // Share keys sit in the URL - never pass them on to other sites
  res.set('Referrer-Policy', 'same-origin')
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  res.set('Cross-Origin-Opener-Policy', 'same-origin')
  res.set('Cross-Origin-Resource-Policy', 'same-origin')
  // Keep albums and their images out of search engines
  res.set('X-Robots-Tag', 'noindex, nofollow, noimageindex')
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000')
  next()
}

/**
 * Key for the login throttle. IPv6 users usually own a whole /64 and can hop
 * between its addresses at will, so all of them count as one client.
 */
export function throttleKey (ip: string | undefined): string {
  if (!ip) return 'unknown'
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]
  if (!net.isIPv6(ip)) return ip
  return expandIPv6(ip).slice(0, 4).join(':') + '::/64'
}

function expandIPv6 (ip: string): string[] {
  const [head, tail] = ip.split('%')[0].split('::')
  const left = head ? head.split(':') : []
  const right = tail !== undefined && tail ? tail.split(':') : []
  const missing = tail !== undefined ? 8 - left.length - right.length : 0
  return [...left, ...Array(missing).fill('0'), ...right].map(part => (parseInt(part, 16) || 0).toString(16))
}

export function clientIp (req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown'
}
