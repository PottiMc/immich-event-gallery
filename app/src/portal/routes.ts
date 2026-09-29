/*
 * Portal routes on the public app:
 *   GET  /          landing page with the password field
 *   POST /          password login -> redirect into the matching album
 *   GET  /z/:token  QR code / access link -> redirect into the album
 *   GET  /license   licence notice with the source code link (AGPL-3.0),
 *                   also as /lizenz
 *   POST /share/unlock  password page of a /share/<key> link (see unlockShare)
 *   GET/POST /newsletter/:token  newsletter confirmation (see newsletter.ts)
 */

import dayjs from 'dayjs'
import { Express, Request, Response } from 'express-serve-static-core'
import { h } from 'preact'
import { encrypt } from '../encrypt'
import { asyncHandler } from '../http'
import { getShareByKey, isKey } from '../immich'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { listSharedLinks, matchAccessToken, matchPassword, passwordEquals, PortalLink } from './links'
import { clientIp as requestIp, throttleKey } from './security'
import { publicBaseUrl, sessionDays } from './settings'
import { LoginThrottle } from './throttle'
import { recordLogin } from './stats'
import { langOf, t, varyLang } from './i18n'
import { Landing, LandingProps, LicensePage } from './views'
import { registerNewsletterRoutes } from './newsletter'

export const guestThrottle = new LoginThrottle()

// Short pause on every wrong attempt - makes guessing slower without
// bothering a guest who mistyped once
const FAIL_DELAY_MS = 600

/** Throttle bucket of the visitor (a single IPv4 address or an IPv6 /64). */
function clientIp (req: Request): string {
  return throttleKey(requestIp(req))
}

function baseUrl (req: Request): string {
  return publicBaseUrl(req.headers.host, req.protocol)
}

function noStore (res: Response) {
  res.header('Cache-Control', 'no-store')
}

function renderLanding (req: Request, res: Response, status: number, props: Omit<LandingProps, 'baseUrl' | 'lang'> = {}) {
  noStore(res)
  res.status(status).send(renderPage(h(Landing, { baseUrl: baseUrl(req), lang: langOf(res), ...props })))
}

/**
 * Store the link's password in the encrypted session cookie, exactly like
 * IPP's own unlock flow does - just valid for longer.
 */
export function grantAccess (req: Request, key: string, password: string | null) {
  if (!req.session || !password) return
  const days = sessionDays()
  req.session[key] = encrypt(JSON.stringify({
    password,
    expires: dayjs().add(days, 'day').format()
  }))
  if (req.sessionOptions) req.sessionOptions.maxAge = days * 24 * 60 * 60 * 1000
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function registerPortalRoutes (app: Express) {
  app.get('/', (req, res) => {
    renderLanding(req, res, 200)
  })

  app.get(['/license', '/lizenz'], (_req, res) => {
    varyLang(res)
    res.send(renderPage(h(LicensePage, { lang: langOf(res) })))
  })

  app.post('/', asyncHandler(async (req, res) => {
    const ip = clientIp(req)
    const gate = guestThrottle.check(ip)
    if (!gate.allowed) {
      renderLanding(req, res, 429, { error: 'throttled', retryAfterSec: gate.retryAfterSec })
      return
    }

    const input = typeof req.body?.passwort === 'string' ? req.body.passwort.slice(0, 200) : ''
    let list = await listSharedLinks()
    let link = list.ok ? matchPassword(list.links, input) : undefined
    if (list.ok && !link) {
      // Maybe the album was shared seconds ago - look again with fresh data
      list = await listSharedLinks(5_000)
      link = list.ok ? matchPassword(list.links, input) : undefined
    }
    if (!list.ok) {
      log.error('Portal login unavailable: ' + list.message)
      renderLanding(req, res, 503, { error: 'unavailable' })
      return
    }

    if (!link) {
      const next = guestThrottle.fail(ip)
      log('Portal: wrong password from ' + ip)
      await delay(FAIL_DELAY_MS)
      if (!next.allowed) {
        log.warn('Portal: ' + (next.global ? 'global' : ip) + ' blocked for ' + next.retryAfterSec + 's')
        renderLanding(req, res, 429, { error: 'throttled', retryAfterSec: next.retryAfterSec })
      } else {
        renderLanding(req, res, 401, { error: 'wrong', remaining: guestThrottle.remaining(ip) })
      }
      return
    }

    guestThrottle.succeed(ip)
    grantAccess(req, link.key, link.password)
    recordLogin(req, link, 'password')
    log('Portal: login to link ' + link.id + ' from ' + ip)
    res.redirect(303, '/share/' + link.key)
  }))

  app.get('/z/:token', asyncHandler(async (req, res) => {
    const ip = clientIp(req)
    const gate = guestThrottle.check(ip, { global: false })
    if (!gate.allowed) {
      renderLanding(req, res, 429, { error: 'throttled', retryAfterSec: gate.retryAfterSec })
      return
    }
    const list = await listSharedLinks()
    if (!list.ok) {
      log.error('Portal access link unavailable: ' + list.message)
      renderLanding(req, res, 503, { error: 'unavailable' })
      return
    }
    const link = matchAccessToken(list.links, req.params.token)
    if (!link) {
      guestThrottle.fail(ip, { global: false })
      log('Portal: invalid access token from ' + ip)
      renderLanding(req, res, 404, { error: 'qr-invalid' })
      return
    }
    guestThrottle.succeed(ip)
    grantAccess(req, link.key, link.password)
    recordLogin(req, link, 'qr')
    log('Portal: QR access to link ' + link.id + ' from ' + ip)
    noStore(res)
    res.redirect(303, '/share/' + link.key)
  }))

  registerNewsletterRoutes(app)
}

/**
 * Password check for a /share/<key> link. Returns the password to store in
 * the session (plus the link, if it is in the API key owner's list), or
 * undefined if the input is wrong.
 */
async function verifySharePassword (key: string, input: string): Promise<{ password: string, link?: PortalLink } | undefined> {
  let list = await listSharedLinks()
  let link = list.ok ? list.links.find(l => l.key === key) : undefined
  if (list.ok && !link) {
    list = await listSharedLinks(5_000)
    link = list.ok ? list.links.find(l => l.key === key) : undefined
  }
  if (link) {
    // Same forgiving comparison as the landing page; the session gets the
    // real password, which is what Immich expects
    return link.password && passwordEquals(link.password, input) ? { password: link.password, link } : undefined
  }
  // Not in the API key owner's list (e.g. another Immich user's link, or the
  // list is unavailable): let Immich decide, exact match only
  if (!input) return undefined
  const share = await getShareByKey(key, input)
  return share.valid && share.link && !share.passwordRequired ? { password: input } : undefined
}

/**
 * [ROUTE] POST /share/unlock - replaces IPP's unchecked unlock, which stored
 * any password in the session and left the check to the next page load.
 * That path bypassed the login throttle for anyone who knew a share key (it
 * is in every guest's address bar). Now the password is verified here, under
 * the same throttle as the landing page.
 */
export async function unlockShare (req: Request, res: Response) {
  noStore(res)
  // JSON only: the password page posts JSON, and this blocks cross-site
  // HTML form posts (a JSON body from another site needs CORS approval)
  if (!req.is('application/json')) {
    res.status(415).json({ error: t(langOf(res)).unlock.invalidRequest })
    return
  }
  const ip = clientIp(req)
  const gate = guestThrottle.check(ip)
  if (!gate.allowed) {
    res.status(429).json({ error: throttledText(res, gate.retryAfterSec) })
    return
  }
  const key = typeof req.body?.key === 'string' ? req.body.key : ''
  const input = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : ''
  if (!isKey(key) || key.length > 200) {
    res.status(400).json({ error: t(langOf(res)).unlock.invalidRequest })
    return
  }

  const verified = await verifySharePassword(key, input)
  if (!verified) {
    const next = guestThrottle.fail(ip)
    log('Portal: wrong password for a share link from ' + ip)
    await delay(FAIL_DELAY_MS)
    if (!next.allowed) {
      log.warn('Portal: ' + (next.global ? 'global' : ip) + ' blocked for ' + next.retryAfterSec + 's')
      res.status(429).json({ error: throttledText(res, next.retryAfterSec) })
    } else {
      res.status(401).json({ error: t(langOf(res)).unlock.wrong })
    }
    return
  }

  guestThrottle.succeed(ip)
  grantAccess(req, key, verified.password)
  if (verified.link) recordLogin(req, verified.link, 'password')
  res.json({ ok: true })
}

function throttledText (res: Response, retryAfterSec: number): string {
  const m = t(langOf(res))
  return m.throttled(m.wait(retryAfterSec))
}
