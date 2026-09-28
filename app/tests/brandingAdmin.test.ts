import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { adminFormToken, createAdminApp } from '../src/portal/admin'
import { isWebAddress, parseBrandTexts } from '../src/portal/admin-branding'
import {
  brandFileSource,
  brandTextSource,
  brandUrl,
  imageInfo,
  MAX_BRAND_FILE_BYTES,
  resetBrandFile,
  resetBrandingCache,
  resetBrandTexts,
  saveBrandFile,
  saveBrandTexts
} from '../src/portal/branding'
import { brandName, imprintUrl, shareTextTemplate, shareUrl, websiteUrl } from '../src/portal/settings'

function png (width: number, height: number): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const size = Buffer.alloc(8)
  size.writeUInt32BE(width, 0)
  size.writeUInt32BE(height, 4)
  return Buffer.concat([header, size, Buffer.alloc(9)])
}

function jpeg (width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 3])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([app0, sof, Buffer.alloc(16)])
}

const ico = Buffer.from([0, 0, 1, 0, 1, 0, 48, 48, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0])

let data: string
let folder: string

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
})

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), 'eg-data-'))
  folder = mkdtempSync(join(tmpdir(), 'eg-branding-'))
  process.env.DATA_DIR = data
  process.env.BRANDING_DIR = folder
  resetBrandingCache()
})

afterEach(() => {
  rmSync(data, { recursive: true, force: true })
  rmSync(folder, { recursive: true, force: true })
  resetBrandingCache()
})

afterAll(() => {
  delete process.env.DATA_DIR
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

describe('image checks', () => {
  it('recognises PNG, JPEG and ICO with their size', () => {
    expect(imageInfo(png(732, 283))).toEqual({ format: 'png', width: 732, height: 283 })
    expect(imageInfo(jpeg(1200, 630))).toEqual({ format: 'jpeg', width: 1200, height: 630 })
    expect(imageInfo(ico)).toEqual({ format: 'ico', width: 48, height: 48 })
    expect(imageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined()
    expect(imageInfo(Buffer.alloc(0))).toBeUndefined()
  })

  it('accepts only the format of the slot and at most 5 MB', () => {
    expect(saveBrandFile('logo-banner.png', jpeg(10, 10))).toMatchObject({ ok: false, error: 'type' })
    expect(saveBrandFile('og-image.jpg', png(10, 10))).toMatchObject({ ok: false, error: 'type' })
    expect(saveBrandFile('favicon.ico', png(48, 48)).ok).toBe(true)
    expect(saveBrandFile('evil.html', png(10, 10))).toMatchObject({ ok: false, error: 'type' })
    expect(saveBrandFile('../settings.json', png(10, 10))).toMatchObject({ ok: false, error: 'type' })
    const big = Buffer.concat([png(10, 10), Buffer.alloc(MAX_BRAND_FILE_BYTES)])
    expect(saveBrandFile('icon-192.png', big)).toMatchObject({ ok: false, error: 'size' })
  })
})

describe('branding layers', () => {
  it('prefers the admin page, then the branding folder, then the default', () => {
    expect(brandFileSource('logo-banner.png')).toBe('default')
    writeFileSync(join(folder, 'logo-banner.png'), png(732, 283))
    expect(brandFileSource('logo-banner.png')).toBe('folder')
    expect(saveBrandFile('logo-banner.png', png(800, 300)).ok).toBe(true)
    expect(brandFileSource('logo-banner.png')).toBe('admin')
    expect(readFileSync(join(data, 'branding', 'logo-banner.png')).equals(png(800, 300))).toBe(true)
    expect(brandUrl('logo-banner.png')).toMatch(/^\/share\/static\/brand\/logo-banner\.png\?v=\w+$/)
    expect(resetBrandFile('logo-banner.png').ok).toBe(true)
    expect(brandFileSource('logo-banner.png')).toBe('folder')
  })

  it('lays saved texts over branding.json and can reset them', () => {
    writeFileSync(join(folder, 'branding.json'), JSON.stringify({ brandName: 'Weingut Beispiel', websiteUrl: 'https://weingut.example' }))
    resetBrandingCache()
    expect(brandName()).toBe('Weingut Beispiel')
    expect(brandTextSource('brandName')).toBe('folder')

    const parsed = parseBrandTexts({
      brandName: ' Neuer Name ',
      websiteUrl: 'https://neu.example',
      imprintUrl: '',
      privacyUrl: 'https://neu.example/datenschutz',
      shareUrl: '',
      shareTextEn: 'With us: {title}',
      shareTextDe: ''
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(saveBrandTexts(parsed.texts).ok).toBe(true)
    expect(brandName()).toBe('Neuer Name')
    expect(brandTextSource('brandName')).toBe('admin')
    expect(websiteUrl()).toBe('https://neu.example')
    expect(imprintUrl()).toBe('')
    expect(shareUrl()).toBe('')
    expect(shareTextTemplate('en')).toBe('With us: {title}')
    // An empty share text means the default of that language
    expect(shareTextTemplate('de')).toBe('Das war „{titel}“ – Bild {nr} von {anzahl}')

    expect(resetBrandTexts().ok).toBe(true)
    expect(brandName()).toBe('Weingut Beispiel')
  })

  it('falls back to the neutral name when the name is cleared', () => {
    const parsed = parseBrandTexts({ brandName: '' })
    expect(parsed.ok && saveBrandTexts(parsed.texts).ok).toBe(true)
    expect(brandName('en')).toBe('Photo Portal')
    expect(brandName('de')).toBe('Bilder-Portal')
  })

  it('accepts only http(s) addresses for links', () => {
    expect(isWebAddress('https://weingut.example/impressum')).toBe(true)
    expect(isWebAddress('javascript:alert(1)')).toBe(false)
    expect(isWebAddress('https://x.example/"onmouseover="alert(1)')).toBe(false)
    expect(isWebAddress('weingut.example')).toBe(false)
    expect(parseBrandTexts({ imprintUrl: 'javascript:alert(1)' })).toEqual({ ok: false, field: 'imprintUrl', reason: 'url' })
    expect(parseBrandTexts({ brandName: 'x'.repeat(81) })).toEqual({ ok: false, field: 'brandName', reason: 'length' })
  })
})

describe('branding page', () => {
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
    body: new URLSearchParams(fields).toString()
  })

  const upload = (name: string, body: Buffer, token = adminFormToken()) => fetch(base + '/branding/bild/' + name, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream', 'x-csrf-token': token, 'accept-language': 'en' },
    body
  })

  it('shows the page in the chosen language', async () => {
    const res = await fetch(base + '/branding', { headers: { ...auth, 'accept-language': 'de' } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Texte und Links')
    expect(html).toContain('Logos und Icons')
    expect(html).toContain('href="/branding" aria-current="page"')
  })

  it('saves texts with a valid token and refuses bad input', async () => {
    const ok = await postForm('/branding/texte', { csrf: adminFormToken(), brandName: 'Weingut Test', websiteUrl: 'https://weingut.example' })
    expect(ok.status).toBe(303)
    expect(ok.headers.get('location')).toBe('/branding?gespeichert#texte')
    expect(brandName()).toBe('Weingut Test')

    expect((await postForm('/branding/texte', { brandName: 'No token' })).status).toBe(400)
    const bad = await postForm('/branding/texte', { csrf: adminFormToken(), websiteUrl: 'javascript:alert(1)' })
    expect(bad.status).toBe(400)
    expect(brandName()).toBe('Weingut Test')
  })

  it('uploads images, rejects wrong ones and serves the new file', async () => {
    const good = await upload('icon-192.png', png(192, 192))
    expect(good.status).toBe(200)
    expect(brandFileSource('icon-192.png')).toBe('admin')
    const served = await fetch(base + '/share/static/brand/icon-192.png')
    expect(Buffer.from(await served.arrayBuffer()).equals(png(192, 192))).toBe(true)

    expect((await upload('icon-192.png', png(192, 192), 'wrong')).status).toBe(400)
    const wrong = await upload('icon-192.png', jpeg(192, 192))
    expect(wrong.status).toBe(415)
    expect((await wrong.json()).error).toContain('PNG')
    expect((await upload('og-image.jpg', Buffer.concat([jpeg(10, 10), Buffer.alloc(MAX_BRAND_FILE_BYTES)]))).status).toBe(413)
    expect((await upload('settings.json', png(10, 10))).status).toBe(400)

    const reset = await postForm('/branding/bild/icon-192.png/zuruecksetzen', { csrf: adminFormToken() })
    expect(reset.status).toBe(303)
    expect(brandFileSource('icon-192.png')).toBe('default')
  })

  it('needs the admin password', async () => {
    expect((await fetch(base + '/branding')).status).toBe(401)
  })
})

describe('data folder layout', () => {
  it('keeps uploads inside DATA_DIR/branding', () => {
    mkdirSync(join(data, 'branding'), { recursive: true })
    expect(saveBrandFile('og-image.jpg', jpeg(1200, 630)).ok).toBe(true)
    expect(readFileSync(join(data, 'branding', 'og-image.jpg')).length).toBeGreaterThan(0)
  })
})
