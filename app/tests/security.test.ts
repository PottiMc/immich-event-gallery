import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import express from 'express'
import cookieSession from 'cookie-session'
import { throttleKey, securityHeaders } from '../src/portal/security'
import { LoginThrottle } from '../src/portal/throttle'
import { passwordEquals } from '../src/portal/links'
import { guestThrottle, unlockShare } from '../src/portal/routes'
import { asyncHandler } from '../src/http'
import { languageMiddleware } from '../src/portal/i18n'

describe('throttleKey', () => {
  it('keeps IPv4 addresses as they are', () => {
    expect(throttleKey('203.0.113.7')).toBe('203.0.113.7')
    expect(throttleKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('groups IPv6 addresses by /64', () => {
    const a = throttleKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    const b = throttleKey('2001:db8:1:2::1')
    const c = throttleKey('2001:0db8:0001:0002:0:0:0:ffff')
    expect(a).toBe('2001:db8:1:2::/64')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(throttleKey('2001:db8:1:3::1')).not.toBe(a)
    expect(throttleKey('::1')).toBe('0:0:0:0::/64')
  })

  it('falls back for missing values', () => {
    expect(throttleKey(undefined)).toBe('unknown')
  })
})

describe('LoginThrottle global option', () => {
  it('keeps { global: false } routes out of the global block', () => {
    let now = 0
    const t = new LoginThrottle({ maxFailures: 100, globalMaxFailures: 3 }, () => now)
    for (let i = 0; i < 4; i++) t.fail('10.0.0.' + i)
    expect(t.check('10.0.0.99').allowed).toBe(false)
    expect(t.check('10.0.0.99', { global: false }).allowed).toBe(true)
    now += 60 * 60_000
    expect(t.check('10.0.0.99').allowed).toBe(true)
  })

  it('does not count { global: false } failures globally', () => {
    const t = new LoginThrottle({ maxFailures: 100, globalMaxFailures: 3 }, () => 0)
    for (let i = 0; i < 10; i++) t.fail('10.0.1.' + i, { global: false })
    expect(t.check('10.0.1.99').allowed).toBe(true)
  })
})

describe('passwordEquals', () => {
  it('compares normalised passwords', () => {
    expect(passwordEquals('riesling-karaffe-4827', 'Riesling Karaffe 4827')).toBe(true)
    expect(passwordEquals('riesling-karaffe-4827', 'riesling-karaffe-4828')).toBe(false)
    expect(passwordEquals('riesling-karaffe-4827', '')).toBe(false)
  })
})

/*
 * /share/unlock against a fake Immich that lists one password-protected link.
 */
describe('POST /share/unlock', () => {
  const KEY = 'abcDEF123_-xyz'
  let immich: http.Server
  let app: http.Server
  let base = ''

  beforeAll(async () => {
    process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
    process.env.BRANDING_DIR = 'tests/no-branding'
    immich = http.createServer((req, res) => {
      if (req.url === '/api/shared-links' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify([{
          id: 'l1',
          key: KEY,
          slug: null,
          password: 'riesling-karaffe-4827',
          description: null,
          type: 'ALBUM',
          createdAt: '2026-09-01T10:00:00.000Z',
          expiresAt: null,
          allowDownload: true
        }]))
      } else {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ message: 'Invalid share key' }))
      }
    })
    await new Promise<void>(resolve => immich.listen(0, '127.0.0.1', resolve))
    process.env.IMMICH_URL = 'http://127.0.0.1:' + (immich.address() as AddressInfo).port
    process.env.IMMICH_API_KEY = 'test-key'

    const e = express()
    e.use(securityHeaders)
    e.use(cookieSession({ name: 'session', secret: 'x' }))
    e.use(express.json())
    e.use(express.urlencoded({ extended: false }))
    e.use(languageMiddleware)
    e.post('/share/unlock', asyncHandler(unlockShare))
    app = e.listen(0, '127.0.0.1')
    await new Promise(resolve => app.once('listening', resolve))
    base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port
  })

  afterAll(() => {
    immich.close()
    app.close()
  })

  const post = (body: unknown, type = 'application/json', lang = 'en') => fetch(base + '/share/unlock', {
    method: 'POST',
    headers: { 'Content-Type': type, 'Accept-Language': lang },
    body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body as Record<string, string>).toString()
  })

  it('accepts the right password (normalised) and sets the session cookie', async () => {
    const res = await post({ key: KEY, password: 'Riesling Karaffe 4827' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('session=')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects a wrong password without setting a session', async () => {
    const res = await post({ key: KEY, password: 'falsch-falsch-0000' })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await res.json()).error).toContain('password')
  })

  it('answers in the visitor language', async () => {
    const res = await post({ key: KEY, password: 'falsch-falsch-0000' }, 'application/json', 'de-DE,de;q=0.9,en;q=0.8')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toContain('Passwort')
  })

  it('rejects unknown keys and malformed keys', async () => {
    expect((await post({ key: 'unknown-key', password: 'riesling-karaffe-4827' })).status).toBe(401)
    expect((await post({ key: '../etc', password: 'x' })).status).toBe(400)
  })

  it('rejects form posts (cross-site forms)', async () => {
    const res = await post({ key: KEY, password: 'riesling-karaffe-4827' }, 'application/x-www-form-urlencoded')
    expect(res.status).toBe(415)
  })

  it('blocks after repeated wrong passwords', async () => {
    let last = 0
    for (let i = 0; i < 6; i++) last = (await post({ key: KEY, password: 'falsch-' + i })).status
    expect(last).toBe(429)
    // Even the right password is refused while blocked
    expect((await post({ key: KEY, password: 'riesling-karaffe-4827' })).status).toBe(429)
    guestThrottle.succeed('127.0.0.1')
  }, 20_000)

  it('sends the security headers', async () => {
    const res = await post({ key: KEY, password: 'x' })
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
  })
})
