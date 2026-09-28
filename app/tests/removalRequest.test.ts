import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import express from 'express'
import { h } from 'preact'
import {
  handleRemovalRequest,
  MAX_PHOTOS,
  parseRemovalRequest,
  removalMail,
  resetRemovalThrottle,
  setRemovalTransport
} from '../src/portal/removal'
import { languageMiddleware } from '../src/portal/i18n'
import { resetBrandingCache } from '../src/portal/branding'
import { Gallery, GalleryProps } from '../src/view/gallery'
import { renderPage } from '../src/view/render'
import { Asset, AssetType, KeyType, SharedLink } from '../src/types'

function asset (id: string, name?: string): Asset {
  return {
    id,
    key: 'share-key',
    keyType: KeyType.key,
    type: AssetType.image,
    isTrashed: false,
    originalFileName: name,
    localDateTime: '2026-09-24T15:32:10.000Z'
  }
}

const link: SharedLink = {
  id: 'link-1',
  key: 'share-key',
  keyType: KeyType.key,
  type: 'ALBUM',
  description: 'Wine hike',
  assets: [asset('a1', 'IMG_0001.JPG'), asset('a2', 'IMG_0002.JPG'), asset('a3', 'IMG_0003.JPG')],
  expiresAt: null
}

const valid = {
  assets: ['a2'],
  reason: 'self',
  details: 'I am the person in the red jacket on the left.',
  name: 'Alex Example',
  email: 'alex@example.com',
  confirm: true
}

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

describe('parseRemovalRequest', () => {
  it('accepts a complete request', () => {
    const parsed = parseRemovalRequest(valid, link)
    expect(parsed).toEqual({
      ok: true,
      value: { assetIds: ['a2'], reason: 'self', details: valid.details, name: valid.name, email: valid.email }
    })
  })

  it('drops photos that are not in the share', () => {
    expect(parseRemovalRequest({ ...valid, assets: ['a1', 'other'] }, link))
      .toMatchObject({ ok: true, value: { assetIds: ['a1'] } })
    expect(parseRemovalRequest({ ...valid, assets: ['other'] }, link)).toEqual({ ok: false, error: 'invalid' })
  })

  it('requires a privacy reason, an explanation, contact details and the confirmation', () => {
    for (const change of [
      { reason: 'bad-hair-day' },
      { details: 'too short' },
      { name: '' },
      { email: 'not-an-email' },
      { email: 'a@b.c\nBcc: x@y.z' },
      { confirm: false },
      { confirm: 'on' },
      { assets: [] },
      { assets: 'a1' }
    ]) {
      expect(parseRemovalRequest({ ...valid, ...change }, link)).toEqual({ ok: false, error: 'invalid' })
    }
    expect(parseRemovalRequest(null, link)).toEqual({ ok: false, error: 'invalid' })
  })

  it('limits the number of photos per request', () => {
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => 'x' + i)
    expect(parseRemovalRequest({ ...valid, assets: many }, link)).toEqual({ ok: false, error: 'tooMany' })
  })
})

describe('removalMail', () => {
  const ctx = {
    photos: [{ asset: link.assets[1], number: 2 }],
    total: 3,
    albumTitle: 'Wine hike',
    guestLang: 'de' as const,
    ip: '203.0.113.7',
    sentAt: new Date('2026-09-28T19:00:00Z')
  }
  const request = { assetIds: ['a2'], reason: 'self' as const, details: valid.details, name: valid.name, email: valid.email }

  afterEach(() => { delete process.env.IMMICH_ADMIN_URL })

  it('lists the photos, the reason and the contact details (German)', () => {
    const mail = removalMail(request, ctx, 'de')
    expect(mail.subject).toBe('Bitte meine Bilder entfernen')
    expect(mail.text).toContain('Album: Wine hike')
    expect(mail.text).toContain('Bild 2 von 3 – IMG_0002.JPG – 2026-09-24 15:32')
    expect(mail.text).toContain('ID a2')
    expect(mail.text).toContain('Grund: Ich bin auf dem Bild zu erkennen')
    expect(mail.text).toContain(valid.details)
    expect(mail.text).toContain('E-Mail: alex@example.com')
    expect(mail.text).toContain('IP: 203.0.113.7')
  })

  it('links to the photos in Immich when IMMICH_ADMIN_URL is set', () => {
    process.env.IMMICH_ADMIN_URL = 'https://immich.example.com/'
    expect(removalMail(request, ctx, 'en').text).toContain('https://immich.example.com/photos/a2')
  })
})

describe('POST removal request', () => {
  let server: http.Server
  let base: string
  const sent: Array<Record<string, unknown>> = []
  let failSend = false

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use(languageMiddleware)
    app.post('/share/:key/removal-request', (req, res, next) => {
      handleRemovalRequest(req, res, link).catch(next)
    })
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => { server.close() })

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.REMOVAL_REQUEST_TO = 'owner@example.com'
    process.env.REMOVAL_REQUEST_LANG = 'de'
    process.env.SMTP_FROM = 'portal@example.com'
    sent.length = 0
    failSend = false
    resetRemovalThrottle()
    setRemovalTransport({
      sendMail: async (mail: Record<string, unknown>) => {
        if (failSend) throw new Error('SMTP down')
        sent.push(mail)
        return {}
      }
    } as never)
  })

  afterEach(() => {
    for (const key of ['SMTP_HOST', 'REMOVAL_REQUEST_TO', 'REMOVAL_REQUEST_LANG', 'SMTP_FROM']) delete process.env[key]
    setRemovalTransport(undefined)
  })

  function post (body: unknown, headers: Record<string, string> = {}) {
    return fetch(base + '/share/share-key/removal-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', ...headers },
      body: JSON.stringify(body)
    })
  }

  it('e-mails the operator with the guest as reply-to', async () => {
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      from: 'portal@example.com',
      to: 'owner@example.com',
      replyTo: 'alex@example.com',
      subject: 'Bitte meine Bilder entfernen'
    })
    expect(sent[0].text).toContain('Bild 2 von 3 – IMG_0002.JPG')
  })

  it('is off without SMTP settings', async () => {
    delete process.env.SMTP_HOST
    expect((await post(valid)).status).toBe(404)
    expect(sent).toHaveLength(0)
  })

  it('rejects incomplete and cross-site requests', async () => {
    const incomplete = await post({ ...valid, confirm: false })
    expect(incomplete.status).toBe(400)
    expect((await incomplete.json()).error).toMatch(/fill in all fields/)
    expect((await post(valid, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('allows three requests per hour and IP', async () => {
    for (let i = 0; i < 3; i++) expect((await post(valid)).status).toBe(200)
    const blocked = await post(valid)
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toMatch(/several requests/)
    expect(sent).toHaveLength(3)
  })

  it('reports SMTP errors without counting them', async () => {
    failSend = true
    for (let i = 0; i < 3; i++) expect((await post(valid)).status).toBe(502)
    failSend = false
    expect((await post(valid)).status).toBe(200)
  })
})

describe('gallery button', () => {
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
    portal: { accessUrl: 'https://photos.example.com/z/x', qrSvg: '<svg></svg>', shareTemplate: '', shareUrl: '', albumShareText: '', removalEnabled: true }
  }

  it('shows the button and dialog only when removal requests are enabled', () => {
    const on = renderPage(h(Gallery, props))
    expect(on).toContain('id="eg-removal-open"')
    expect(on).toContain('data-endpoint="/share/share-key/removal-request"')
    expect(on).toContain('Bilder entfernen')
    const off = renderPage(h(Gallery, { ...props, portal: { ...props.portal!, removalEnabled: false } }))
    expect(off).not.toContain('eg-removal')
  })
})
