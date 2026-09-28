/*
 * Login for the admin server: a plain form (so password managers can fill it
 * in) and a signed session cookie. A Basic Auth header is still accepted for
 * scripts, but the server never asks for one, so browsers show no dialog.
 * Every attempt, by form or header, goes through the same lockout.
 */

import crypto from 'crypto'
import express from 'express'
import { Express, NextFunction, Request, Response } from 'express-serve-static-core'
import { h } from 'preact'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { safeEquals, validFormPost } from './admin-forms'
import { AdminLogin, AdminLoginProps } from './admin-views'
import { cookieValue, langOf, t } from './i18n'
import { clientIp, throttleKey } from './security'
import { adminPassword, deriveKey } from './settings'
import { LoginThrottle } from './throttle'

/* Distinct from the guest app's cookies: browsers share cookies across ports of the same host */
export const ADMIN_COOKIE = 'admin_session'
const SESSION_MS = 7 * 24 * 60 * 60 * 1000

const adminThrottle = new LoginThrottle({ maxFailures: 5, globalMaxFailures: 30 })

/**
 * The cookie holds its expiry time plus an HMAC over it and the admin
 * password, so changing PORTAL_ADMIN_PASSWORD logs every browser out.
 */
function signature (expires: string): string {
  return crypto.createHmac('sha256', deriveKey('admin-session'))
    .update(expires + '\n' + adminPassword())
    .digest('base64url')
}

export function adminSessionValue (now = Date.now()): string {
  const expires = String(now + SESSION_MS)
  return expires + '.' + signature(expires)
}

export function validAdminSession (value: string | undefined, now = Date.now()): boolean {
  if (!value) return false
  const dot = value.indexOf('.')
  const expires = value.slice(0, dot)
  if (!/^\d+$/.test(expires) || Number(expires) <= now) return false
  return safeEquals(value.slice(dot + 1), signature(expires))
}

function hasSession (req: Request): boolean {
  return validAdminSession(cookieValue(req.headers.cookie, ADMIN_COOKIE))
}

type Attempt = { ok: true } | { ok: false, retryAfterSec?: number }

function attempt (req: Request, password: string): Attempt {
  const ip = throttleKey(clientIp(req))
  const gate = adminThrottle.check(ip)
  if (!gate.allowed) return { ok: false, retryAfterSec: gate.retryAfterSec }
  const expected = adminPassword()
  if (expected && safeEquals(password, expected)) {
    adminThrottle.succeed(ip)
    return { ok: true }
  }
  log.warn('Admin: wrong password from ' + ip)
  const next = adminThrottle.fail(ip)
  return next.allowed ? { ok: false } : { ok: false, retryAfterSec: next.retryAfterSec }
}

/** Local paths only: "//host" or "/\host" would lead off the site. */
function safeNext (value: unknown): string {
  return typeof value === 'string' && value.length <= 500 && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : '/'
}

function renderLogin (req: Request, res: Response, status: number, props: Omit<AdminLoginProps, 'lang'>) {
  res.status(status).send(renderPage(h(AdminLogin, { lang: langOf(res), ...props })))
}

function basicAuthPassword (req: Request): string | undefined {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Basic ')) return undefined
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  return decoded.slice(decoded.indexOf(':') + 1)
}

/** Guard for every admin route: a valid session cookie or Basic Auth header, else the login page. */
export function requireAdmin (req: Request, res: Response, next: NextFunction) {
  if (hasSession(req)) {
    next()
    return
  }
  const m = t(langOf(res))
  const basic = basicAuthPassword(req)
  if (basic !== undefined) {
    const result = attempt(req, basic)
    if (result.ok) {
      next()
    } else if (result.retryAfterSec) {
      res.status(429).send(m.admin.tooManyFailures(m.wait(result.retryAfterSec)))
    } else {
      res.status(401).send(m.admin.loginRequired)
    }
    return
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    // Shown in place, so the browser keeps the address it asked for
    renderLogin(req, res, 401, { next: safeNext(req.originalUrl) })
    return
  }
  res.status(401).send(m.admin.loginRequired)
}

export function registerLoginRoutes (app: Express) {
  const form = express.urlencoded({ extended: false, limit: '2kb' })

  app.get('/anmelden', (req, res) => {
    if (hasSession(req)) {
      res.redirect(303, '/')
      return
    }
    renderLogin(req, res, 200, { next: '/' })
  })

  app.post('/anmelden', form, (req, res) => {
    const next = safeNext(req.body?.weiter)
    const site = req.get('sec-fetch-site')
    if (site && site !== 'same-origin') {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : ''
    const result = attempt(req, password)
    if (result.ok) {
      res.cookie(ADMIN_COOKIE, adminSessionValue(), {
        maxAge: SESSION_MS,
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        path: '/'
      })
      log('Admin: login from ' + throttleKey(clientIp(req)))
      res.redirect(303, next)
      return
    }
    if (result.retryAfterSec) {
      renderLogin(req, res, 429, { next, error: 'throttled', retryAfterSec: result.retryAfterSec })
    } else {
      renderLogin(req, res, 401, { next, error: 'wrong', remaining: adminThrottle.remaining(throttleKey(clientIp(req))) })
    }
  })

  app.post('/abmelden', form, (req, res) => {
    if (!validFormPost(req)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    res.clearCookie(ADMIN_COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' })
    res.redirect(303, '/anmelden')
  })
}
