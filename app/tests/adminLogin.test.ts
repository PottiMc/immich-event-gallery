import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import { adminFormToken, createAdminApp } from '../src/portal/admin'
import { ADMIN_COOKIE, adminSessionValue, validAdminSession } from '../src/portal/admin-auth'
import { resetBrandingCache } from '../src/portal/branding'

let server: http.Server
let base: string

beforeAll(async () => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
  server = http.createServer(createAdminApp())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

function login (fields: Record<string, string>, headers: Record<string, string> = {}) {
  return fetch(base + '/anmelden', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'en', ...headers },
    body: new URLSearchParams(fields).toString()
  })
}

function sessionCookie (res: Response): string {
  const cookie = res.headers.get('set-cookie') || ''
  expect(cookie).toMatch(new RegExp('^' + ADMIN_COOKIE + '='))
  return cookie.split(';')[0]
}

describe('admin session cookie', () => {
  it('is valid until it expires', () => {
    const now = Date.now()
    const value = adminSessionValue(now)
    expect(validAdminSession(value, now)).toBe(true)
    expect(validAdminSession(value, now + 8 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('rejects tampered values', () => {
    const value = adminSessionValue()
    const [expires, sig] = value.split('.')
    expect(validAdminSession(String(Number(expires) + 1000) + '.' + sig)).toBe(false)
    expect(validAdminSession(expires + '.x' + sig.slice(1))).toBe(false)
    expect(validAdminSession('')).toBe(false)
    expect(validAdminSession('nonsense')).toBe(false)
  })

  it('stops working when the admin password changes', () => {
    const value = adminSessionValue()
    process.env.PORTAL_ADMIN_PASSWORD = 'a-new-admin-password'
    expect(validAdminSession(value)).toBe(false)
    process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
    expect(validAdminSession(value)).toBe(true)
  })
})

describe('admin login page', () => {
  it('shows a password-manager-friendly form instead of a Basic Auth challenge', async () => {
    const res = await fetch(base + '/branding', { headers: { 'accept-language': 'de' } })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBeNull()
    const html = await res.text()
    expect(html).toContain('action="/anmelden"')
    expect(html).toContain('autocomplete="username"')
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toContain('name="weiter" value="/branding"')
    expect(html).toContain('Admin-Passwort')
  })

  it('signs in, returns to the requested page and lets the cookie through', async () => {
    const res = await login({ password: 'admin-test-password', weiter: '/branding' }, { 'sec-fetch-site': 'same-origin' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/branding')
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    const cookie = sessionCookie(res)

    const page = await fetch(base + '/branding', { headers: { cookie } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('action="/abmelden"')
    const loginPage = await fetch(base + '/anmelden', { headers: { cookie }, redirect: 'manual' })
    expect(loginPage.status).toBe(303)
  })

  it('only redirects to local paths', async () => {
    for (const weiter of ['//evil.example/', '/\\evil.example', 'https://evil.example/', '/a b']) {
      const res = await login({ password: 'admin-test-password', weiter })
      expect(res.headers.get('location')).toBe('/')
    }
  })

  it('refuses cross-site logins', async () => {
    const res = await login({ password: 'admin-test-password' }, { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(400)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('signs out with a valid token only', async () => {
    const cookie = sessionCookie(await login({ password: 'admin-test-password' }))
    const logout = (fields: Record<string, string>) => fetch(base + '/abmelden', {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString()
    })
    expect((await logout({})).status).toBe(400)
    const res = await logout({ csrf: adminFormToken() })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/anmelden')
    expect(res.headers.get('set-cookie')).toMatch(new RegExp('^' + ADMIN_COOKIE + '=;.*Expires=Thu, 01 Jan 1970'))
  })

  it('reports wrong passwords and locks out after too many', async () => {
    const first = await login({ password: 'wrong', weiter: '/' })
    expect(first.status).toBe(401)
    expect(first.headers.get('set-cookie')).toBeNull()
    expect(await first.text()).toContain('That password isn’t right.')

    let last = first
    for (let i = 0; i < 5 && last.status !== 429; i++) last = await login({ password: 'wrong' })
    expect(last.status).toBe(429)
    expect(await last.text()).toContain('Too many failed attempts')
    // While blocked, even the right password is refused
    expect((await login({ password: 'admin-test-password' })).status).toBe(429)
  })
})
