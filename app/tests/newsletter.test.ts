import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import express from 'express'
import { h } from 'preact'
import { adminFormToken, createAdminApp } from '../src/portal/admin'
import { newsletterCsv } from '../src/portal/admin-newsletter'
import { resetBrandingCache } from '../src/portal/branding'
import { languageMiddleware } from '../src/portal/i18n'
import { isValidEmail, mailConfig, mailErrorKind, maskEmail, parseFrom, setMailTransport } from '../src/portal/mail'
import {
  confirmSignup,
  createConfirmToken,
  handleNewsletterSignup,
  listEntries,
  markTransferred,
  pendingCount,
  RateWindow,
  recordRequest,
  registerNewsletterRoutes,
  removeEntry,
  resetNewsletterCache,
  resetNewsletterLimits,
  verifyConfirmToken
} from '../src/portal/newsletter'
import { loadRuntimeSettings, saveRuntimeSettings } from '../src/portal/runtime-settings'
import { KeyType, SharedLink } from '../src/types'
import { Gallery, GalleryProps } from '../src/view/gallery'
import { renderPage } from '../src/view/render'

const DAY = 24 * 60 * 60_000

const link: SharedLink = {
  id: 'link-1',
  key: 'share-key',
  keyType: KeyType.key,
  type: 'ALBUM',
  description: 'Weinwanderung an der Saar',
  assets: [],
  expiresAt: null
}

let data: string
const sent: Array<Record<string, unknown>> = []
let failSend = false

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), 'eg-newsletter-'))
  process.env.DATA_DIR = data
  process.env.SMTP_HOST = 'smtp.example.com'
  process.env.SMTP_FROM = 'Weingut Beispiel <info@weingut.example>'
  process.env.PUBLIC_BASE_URL = 'https://photos.example.com'
  loadRuntimeSettings()
  resetNewsletterCache()
  resetNewsletterLimits()
  sent.length = 0
  failSend = false
  setMailTransport({
    sendMail: async (mail: Record<string, unknown>) => {
      if (failSend) throw Object.assign(new Error('Invalid login'), { code: 'EAUTH' })
      sent.push(mail)
      return {}
    }
  } as never)
})

afterEach(() => {
  for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_SECURE', 'NEWSLETTER_NOTIFY', 'PUBLIC_BASE_URL', 'REMOVAL_REQUEST_LANG']) {
    delete process.env[key]
  }
  setMailTransport(undefined)
  rmSync(data, { recursive: true, force: true })
})

afterAll(() => {
  delete process.env.DATA_DIR
  loadRuntimeSettings()
})

describe('mail helpers', () => {
  it('accepts only clean addresses', () => {
    expect(isValidEmail('alex@example.com')).toBe(true)
    expect(isValidEmail('alex.o+news@mail.example.co.uk')).toBe(true)
    expect(isValidEmail('alex@example.com\r\nBcc: x@y.z')).toBe(false)
    expect(isValidEmail('alex @example.com')).toBe(false)
    expect(isValidEmail('alex@example')).toBe(false)
    expect(isValidEmail('a'.repeat(190) + '@example.com')).toBe(false)
  })

  it('reads the sender and the security mode', () => {
    expect(parseFrom('Weingut Beispiel <info@weingut.example>')).toEqual({ name: 'Weingut Beispiel', address: 'info@weingut.example' })
    expect(parseFrom('info@weingut.example')).toEqual({ name: '', address: 'info@weingut.example' })
    expect(mailConfig()).toMatchObject({ port: 587, security: 'starttls', fromAddress: 'info@weingut.example', fromName: 'Weingut Beispiel' })
    process.env.SMTP_PORT = '465'
    expect(mailConfig().security).toBe('ssl')
    process.env.SMTP_SECURITY = 'keine'
    expect(mailConfig().security).toBe('none')
    delete process.env.SMTP_SECURITY
    process.env.SMTP_SECURE = 'false'
    expect(mailConfig().security).toBe('starttls')
  })

  it('sorts SMTP errors into causes and masks addresses', () => {
    expect(mailErrorKind({ code: 'EAUTH' })).toBe('auth')
    expect(mailErrorKind({ code: 'EENVELOPE', command: 'MAIL FROM', responseCode: 550 })).toBe('sender')
    expect(mailErrorKind({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 })).toBe('recipient')
    expect(mailErrorKind({ code: 'ESOCKET', message: 'connect ECONNREFUSED 1.2.3.4:587' })).toBe('unreachable')
    expect(mailErrorKind({ code: 'ESOCKET', message: 'ssl3_get_record:wrong version number' })).toBe('tls')
    expect(maskEmail('jana@beispiel.de')).toBe('j***@beispiel.de')
  })
})

describe('confirmation token', () => {
  it('carries the sign-up and survives the round trip', () => {
    const token = createConfirmToken('Jana@Example.com', 'Jana', 'Weinwanderung')
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(verifyConfirmToken(token)).toMatchObject({ m: 'Jana@Example.com', n: 'Jana', q: 'Weinwanderung' })
  })

  it('expires after 14 days', () => {
    const now = Date.now()
    const token = createConfirmToken('jana@example.com', '', '', now - 15 * DAY)
    expect(verifyConfirmToken(token, now)).toBeUndefined()
    expect(verifyConfirmToken(createConfirmToken('jana@example.com', '', '', now - 13 * DAY), now)).toBeDefined()
  })

  it('rejects changed payloads and signatures', () => {
    const token = createConfirmToken('jana@example.com', 'Jana', '')
    const [payload, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ m: 'eve@example.com', n: '', q: '', t: Math.floor(Date.now() / 1000) })).toString('base64url')
    expect(verifyConfirmToken(forged + '.' + sig)).toBeUndefined()
    expect(verifyConfirmToken(payload + '.' + sig.slice(0, -2) + 'xx')).toBeUndefined()
    expect(verifyConfirmToken('nonsense')).toBeUndefined()
    expect(verifyConfirmToken(undefined)).toBeUndefined()
  })
})

describe('newsletter list', () => {
  it('stores requests, confirms once and ignores the letter case', () => {
    recordRequest('Jana@Example.com', 'Jana', 'Album A')
    expect(listEntries()).toHaveLength(1)
    expect(pendingCount()).toBe(0)
    const token = verifyConfirmToken(createConfirmToken('jana@example.com', 'Jana', 'Album A'))!
    expect(confirmSignup(token, '203.0.113.7')).toBe(true)
    expect(confirmSignup(token, '203.0.113.7')).toBe(false)
    const [entry] = listEntries()
    expect(entry).toMatchObject({ email: 'jana@example.com', ip: '203.0.113.7', transferredAt: null })
    expect(entry.confirmedAt).toBeTruthy()
    expect(pendingCount()).toBe(1)
    // A new request for a confirmed address changes nothing
    recordRequest('JANA@example.com', 'Other', 'Album B')
    expect(listEntries()[0].source).toBe('Album A')
    // Saved atomically to the data folder
    const file = join(data, 'newsletter.json')
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveLength(1)
    expect(existsSync(file + '.tmp')).toBe(false)
    resetNewsletterCache()
    expect(listEntries()).toHaveLength(1)
  })

  it('creates the entry from the token when the list lost it', () => {
    const token = verifyConfirmToken(createConfirmToken('max@example.com', '', 'Album'))!
    expect(confirmSignup(token, '::1')).toBe(true)
    expect(listEntries()[0].email).toBe('max@example.com')
  })

  it('marks only confirmed addresses as added and can delete', () => {
    recordRequest('open@example.com', '', '')
    confirmSignup(verifyConfirmToken(createConfirmToken('done@example.com', '', ''))!, '::1')
    expect(markTransferred(['open@example.com', 'DONE@example.com'], true)).toBe(1)
    expect(pendingCount()).toBe(0)
    expect(markTransferred(['done@example.com'], false)).toBe(1)
    expect(pendingCount()).toBe(1)
    expect(removeEntry('Done@Example.com')).toBe(true)
    expect(removeEntry('done@example.com')).toBe(false)
  })

  it('drops unconfirmed sign-ups after 30 days', () => {
    recordRequest('old@example.com', '', '', new Date(Date.now() - 31 * DAY))
    recordRequest('new@example.com', '', '')
    expect(listEntries().map(e => e.email)).toEqual(['new@example.com'])
  })

  it('exports CSV for Excel', () => {
    confirmSignup(verifyConfirmToken(createConfirmToken('jana@example.com', '=HYPERLINK("x")', 'Album; Saar'))!, '::1')
    const csv = newsletterCsv(listEntries(), 'de')
    expect(csv.startsWith('﻿E-Mail;Name;Anlass;Angefragt;Bestätigt;IP;Übertragen\r\n')).toBe(true)
    expect(csv).toContain('jana@example.com;"\'=HYPERLINK(""x"")";"Album; Saar";')
  })
})

describe('rate window', () => {
  it('allows a number of hits per window', () => {
    let now = 0
    const limit = new RateWindow(2, 1000, () => now)
    limit.hit('a')
    limit.hit('a')
    expect(limit.allowed('a')).toBe(false)
    expect(limit.allowed('b')).toBe(true)
    now = 1001
    expect(limit.allowed('a')).toBe(true)
  })
})

describe('sign-up and confirmation routes', () => {
  let server: http.Server
  let base: string

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', true)
    app.use(express.json())
    app.use(languageMiddleware)
    app.post('/share/:key/newsletter', (req, res, next) => {
      handleNewsletterSignup(req, res, link).catch(next)
    })
    registerNewsletterRoutes(app as never)
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => { server.close() })

  function signUp (body: unknown, headers: Record<string, string> = {}) {
    return fetch(base + '/share/share-key/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'de', ...headers },
      body: JSON.stringify(body)
    })
  }

  it('is off until switched on in the admin', async () => {
    const res = await signUp({ email: 'jana@example.com' })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('Mailversand ist nicht eingerichtet.')
    expect(sent).toHaveLength(0)
  })

  it('sends the confirmation e-mail; only the POST confirms', async () => {
    saveRuntimeSettings({ newsletterEnabled: true })
    // Language of the operator's mails
    process.env.REMOVAL_REQUEST_LANG = 'de'
    const res = await signUp({ email: 'jana@example.com', name: 'Jana' })
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    const mail = sent[0]
    expect(mail).toMatchObject({
      to: 'jana@example.com',
      replyTo: 'info@weingut.example',
      from: { name: 'Weingut Beispiel', address: 'info@weingut.example' },
      subject: 'Bitte bestätige deine Newsletter-Anmeldung – Bilder-Portal',
      headers: { 'Auto-Submitted': 'auto-generated' }
    })
    expect(mail.text).toContain('Hallo Jana,')
    expect(mail.html).toContain('Ja, ich möchte den Newsletter')
    const url = String(mail.text).match(/https:\/\/photos\.example\.com(\/newsletter\/[\w.-]+)/)![1]
    expect(listEntries()[0]).toMatchObject({ email: 'jana@example.com', source: 'Weinwanderung an der Saar', confirmedAt: null })

    // Mail scanners open links: GET only asks
    const page = await fetch(base + url, { headers: { 'Accept-Language': 'de' } })
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('referrer-policy')).toBe('no-referrer')
    const html = await page.text()
    expect(html).toContain('<strong>jana@example.com</strong>')
    expect(html).toContain('Ja, Newsletter bestätigen')
    expect(listEntries()[0].confirmedAt).toBeNull()

    const confirmed = await fetch(base + url, { method: 'POST', headers: { 'Accept-Language': 'de', 'X-Forwarded-For': '203.0.113.9' } })
    expect(confirmed.status).toBe(200)
    expect(await confirmed.text()).toContain('Deine Anmeldung zum Newsletter ist bestätigt.')
    expect(listEntries()[0]).toMatchObject({ ip: '203.0.113.9' })
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ to: 'info@weingut.example', replyTo: 'jana@example.com', subject: 'Neue Newsletter-Anmeldung: jana@example.com' })
    expect(sent[1].text).toContain('Anlass: Weinwanderung an der Saar')

    // A second click confirms again without a second notification
    expect((await fetch(base + url, { method: 'POST' })).status).toBe(200)
    expect(sent).toHaveLength(2)
  })

  it('shows "link expired" for changed or old tokens', async () => {
    const old = createConfirmToken('jana@example.com', '', '', Date.now() - 15 * DAY)
    const res = await fetch(base + '/newsletter/' + old, { headers: { 'Accept-Language': 'de' } })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Link abgelaufen')
    expect((await fetch(base + '/newsletter/abc.def', { method: 'POST' })).status).toBe(400)
    expect(listEntries()).toHaveLength(0)
  })

  it('checks the address, the origin and the limits', async () => {
    saveRuntimeSettings({ newsletterEnabled: true })
    expect((await signUp({ email: 'jana@example.com\nBcc: x@example.com' })).status).toBe(400)
    expect((await signUp({ email: 'jana@example.com' }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(400)
    for (let i = 0; i < 4; i++) expect((await signUp({ email: 'jana@example.com' })).status).toBe(200)
    const limited = await signUp({ email: 'JANA@example.com' })
    expect(limited.status).toBe(429)
    expect((await limited.json()).error).toContain('bitte später noch einmal')
    expect(sent).toHaveLength(4)
  })

  it('stores nothing when the e-mail fails', async () => {
    saveRuntimeSettings({ newsletterEnabled: true })
    failSend = true
    expect((await signUp({ email: 'jana@example.com' })).status).toBe(502)
    expect(listEntries()).toHaveLength(0)
  })
})

describe('gallery band', () => {
  const props: GalleryProps = {
    lang: 'de',
    items: [{ id: 'a1', type: 'IMAGE', previewUrl: '/p', thumbnailUrl: '/t', downloadFilename: 'a.jpg' }],
    title: 'Wine hike',
    description: '',
    publicBaseUrl: 'https://photos.example.com',
    path: '/share/share-key',
    showDownloadZip: true,
    showTitle: true,
    lightboxConfig: { showArrows: true, showDownload: true, mobileArrows: false, autoPlayVideos: false },
    metadataConfig: { descriptionInCaption: false, descriptionInSidebar: false, sidebarHasContent: false, locationWebLink: false },
    groupByDate: false,
    portal: { accessUrl: 'https://photos.example.com/z/x', qrSvg: '<svg></svg>', shareTemplate: '', shareUrl: '', albumShareText: '', removalEnabled: false }
  }

  it('shows the sign-up inside the gallery only when switched on and e-mail works', () => {
    expect(renderPage(h(Gallery, props))).not.toContain('eg-newsletter')
    saveRuntimeSettings({ newsletterEnabled: true, newsletterAfter: 8 })
    const html = renderPage(h(Gallery, props))
    expect(html).toMatch(/<div id="gallery"><section id="eg-newsletter"/)
    expect(html).toContain('data-endpoint="/share/share-key/newsletter"')
    expect(html).toContain('data-after="8"')
    expect(html).toContain('Newsletter abonnieren')
    expect(renderPage(h(Gallery, { ...props, items: [] }))).not.toContain('eg-newsletter')
    delete process.env.SMTP_HOST
    expect(renderPage(h(Gallery, props))).not.toContain('eg-newsletter')
  })

  it('adds the band at the end and the sticky bar only when chosen', () => {
    saveRuntimeSettings({ newsletterEnabled: true })
    const plain = renderPage(h(Gallery, props))
    expect(plain).not.toContain('eg-newsletter-end')
    expect(plain).not.toContain('eg-newsletter-bar')
    saveRuntimeSettings({ newsletterAtEnd: true, newsletterSticky: true })
    const html = renderPage(h(Gallery, props))
    expect(html).toContain('id="eg-newsletter-end"')
    expect(html).toMatch(/id="eg-newsletter-bar"[^>]*hidden/)
    expect(html).toContain('id="eg-newsletter-dialog"')
    expect(html).toContain('>Abonnieren</button>')
    // Three forms, each with its own field ids
    expect(html.match(/class="eg-newsletter-form"/g)).toHaveLength(3)
    for (const id of ['eg-newsletter-email', 'eg-newsletter-end-email', 'eg-newsletter-dialog-email']) {
      expect(html.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1)
    }
    // Switched off, none of them
    saveRuntimeSettings({ newsletterEnabled: false })
    expect(renderPage(h(Gallery, props))).not.toContain('eg-newsletter')
  })
})

describe('newsletter admin page', () => {
  let server: http.Server
  let base: string
  const auth = { authorization: 'Basic ' + Buffer.from('admin:admin-test-password').toString('base64') }

  beforeAll(async () => {
    server = http.createServer(createAdminApp())
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  const postForm = (path: string, fields: Record<string, string>) => fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
    body: new URLSearchParams({ csrf: adminFormToken(), ...fields }).toString()
  })

  it('lists new sign-ups, reminds on the overview tab and ticks them off', async () => {
    confirmSignup(verifyConfirmToken(createConfirmToken('jana@example.com', 'Jana', 'Album'))!, '::1')
    const page = await (await fetch(base + '/newsletter', { headers: { ...auth, 'accept-language': 'de' } })).text()
    expect(page).toContain('1 neu')
    expect(page).toContain('class="adm-tab-count"')
    expect(page).toContain('data-copy="jana@example.com"')

    const marked = await postForm('/newsletter/uebertragen', { 'alle-neuen': '1', an: '1' })
    expect(marked.status).toBe(303)
    expect(marked.headers.get('location')).toBe('/newsletter?markiert=1#newsletter')
    expect(pendingCount()).toBe(0)
    const after = await (await fetch(base + '/newsletter', { headers: { ...auth, 'accept-language': 'de' } })).text()
    expect(after).toContain('alles eingetragen')
    expect(after).not.toContain('adm-tab-count')
  })

  it('saves the settings and refuses forms without the token', async () => {
    expect((await postForm('/newsletter/einstellungen', { enabled: '1', after: '16', sticky: '1' })).status).toBe(303)
    const html = await (await fetch(base + '/newsletter', { headers: auth })).text()
    expect(html).toMatch(/name="enabled" value="1" checked/)
    expect(html).toContain('value="16"')
    expect(html).toMatch(/name="sticky" value="1" checked/)
    expect(html).not.toMatch(/name="atEnd" value="1" checked/)
    const bad = await fetch(base + '/newsletter/einstellungen', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'enabled=1&after=5&csrf=wrong'
    })
    expect(bad.status).toBe(400)
  })

  it('offers the JSON API and the CSV behind the login', async () => {
    confirmSignup(verifyConfirmToken(createConfirmToken('jana@example.com', '', ''))!, '::1')
    expect((await fetch(base + '/api/newsletter')).status).toBe(401)
    const list = await (await fetch(base + '/api/newsletter', { headers: auth })).json()
    expect(list.entries).toHaveLength(1)
    const res = await fetch(base + '/api/newsletter/uebertragen', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'x-csrf-token': adminFormToken() },
      body: JSON.stringify({ mails: ['jana@example.com'], an: true })
    })
    expect(await res.json()).toEqual({ ok: true, anzahl: 1, offen: 0 })
    const csv = await fetch(base + '/api/newsletter.csv?neu=1', { headers: auth })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect((await csv.text()).split('\r\n').filter(Boolean)).toHaveLength(1)
  })

  it('sends a test e-mail and explains failures', async () => {
    const ok = await postForm('/newsletter/testmail', {})
    expect(ok.status).toBe(200)
    expect(sent[0]).toMatchObject({ to: 'info@weingut.example' })
    failSend = true
    const res = await fetch(base + '/api/mail/test', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'x-csrf-token': adminFormToken(), 'accept-language': 'de' },
      body: '{}'
    })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, host: 'smtp.example.com', port: 587, security: 'starttls' })
    expect(body.error).toContain('SMTP_USER und SMTP_PASS prüfen')
    expect(JSON.stringify(body)).not.toContain('SMTP_PASS=')
  })
})
