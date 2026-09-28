import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig } from '../src/config/loader'
import { resolveDownloadEndpoint } from '../src/gallery/sizing'
import { adminFormToken, createAdminApp } from '../src/portal/admin'
import { resetBrandingCache } from '../src/portal/branding'
import { downloadQuality, loadRuntimeSettings, saveRuntimeSettings, settingsPersistent } from '../src/portal/runtime-settings'
import { Asset, AssetType } from '../src/types'

const jpeg = { id: 'a1', type: AssetType.image, originalMimeType: 'image/jpeg' } as Asset
const video = { id: 'v1', type: AssetType.video, originalMimeType: 'video/mp4' } as Asset

let dir: string

function freshConfig (ipp: Record<string, unknown> = {}) {
  process.env.CONFIG = JSON.stringify({ ipp })
  loadConfig()
}

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eg-settings-'))
  process.env.DATA_DIR = dir
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  delete process.env.CONFIG
  delete process.env.DATA_DIR
  loadConfig()
})

describe('runtime settings', () => {
  it('falls back to config.json when nothing was saved', () => {
    freshConfig({ maxDownloadQuality: 'preview' })
    expect(loadRuntimeSettings()).toEqual({})
    expect(downloadQuality()).toBe('preview')
  })

  it('saves, applies at once and survives a reload', () => {
    freshConfig({ maxDownloadQuality: 'original' })
    loadRuntimeSettings()
    expect(resolveDownloadEndpoint(jpeg).subpath).toBe('/original')

    expect(saveRuntimeSettings({ downloadQuality: 'preview' })).toEqual({ ok: true })
    expect(downloadQuality()).toBe('preview')
    expect(resolveDownloadEndpoint(jpeg)).toMatchObject({ subpath: '/thumbnail', sizeQueryParam: 'preview' })
    // Videos always come as the original file
    expect(resolveDownloadEndpoint(video).subpath).toBe('/original')
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toEqual({ downloadQuality: 'preview' })

    // Restart: config.json says original, the saved setting wins
    freshConfig({ maxDownloadQuality: 'original' })
    loadRuntimeSettings()
    expect(downloadQuality()).toBe('preview')
  })

  it('ignores broken or unknown content', () => {
    freshConfig()
    writeFileSync(join(dir, 'settings.json'), '{ not json')
    expect(loadRuntimeSettings()).toEqual({})
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ downloadQuality: 'huge', other: 1 }))
    expect(loadRuntimeSettings()).toEqual({})
    expect(downloadQuality()).toBe('original')
  })

  it('still applies until restart when the folder is not writable', () => {
    freshConfig()
    loadRuntimeSettings()
    // A regular file where the folder should be: nothing can be written below it
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, '')
    process.env.DATA_DIR = join(blocker, 'data')
    expect(settingsPersistent()).toBe(false)
    expect(saveRuntimeSettings({ downloadQuality: 'preview' }).ok).toBe(false)
    expect(downloadQuality()).toBe('preview')
  })
})

describe('admin settings form', () => {
  let server: http.Server
  let base: string
  const auth = 'Basic ' + Buffer.from('admin:admin-test-password').toString('base64')

  beforeAll(async () => {
    server = http.createServer(createAdminApp())
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  function post (fields: Record<string, string>, headers: Record<string, string> = {}) {
    return fetch(base + '/einstellungen', {
      method: 'POST',
      redirect: 'manual',
      headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(fields).toString()
    })
  }

  it('saves with a valid token and redirects back', async () => {
    freshConfig()
    loadRuntimeSettings()
    const res = await post({ csrf: adminFormToken(), downloadQuality: 'preview' }, { 'sec-fetch-site': 'same-origin' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/?gespeichert#einstellungen')
    expect(downloadQuality()).toBe('preview')
  })

  it('rejects cross-site posts, missing tokens and unknown values', async () => {
    freshConfig()
    loadRuntimeSettings()
    expect((await post({ csrf: adminFormToken(), downloadQuality: 'preview' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(400)
    expect((await post({ downloadQuality: 'preview' })).status).toBe(400)
    expect((await post({ csrf: adminFormToken(), downloadQuality: 'fullsize' })).status).toBe(400)
    expect(downloadQuality()).toBe('original')
  })

  it('requires the admin password', async () => {
    const res = await post({ csrf: adminFormToken(), downloadQuality: 'preview' }, { authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') })
    expect(res.status).toBe(401)
  })
})
