import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { brandAsset, brandingTexts, resetBrandingCache } from '../src/portal/branding'
import { brandName, imprintUrl, shareTextTemplate, shareUrl, websiteUrl } from '../src/portal/settings'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eg-branding-'))
  process.env.BRANDING_DIR = dir
  // No uploads from the admin page: an empty data folder
  process.env.DATA_DIR = join(dir, 'data')
  resetBrandingCache()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.DATA_DIR
  resetBrandingCache()
})

describe('branding', () => {
  it('falls back to neutral defaults without a branding folder', () => {
    expect(brandName()).toBe('Photo Portal')
    expect(brandName('de')).toBe('Bilder-Portal')
    expect(websiteUrl()).toBe('')
    expect(imprintUrl()).toBe('')
    expect(shareUrl()).toBe('')
    expect(shareTextTemplate()).toBe('That was “{title}” – photo {number} of {total}')
    expect(shareTextTemplate('de')).toBe('Das war „{titel}“ – Bild {nr} von {anzahl}')
  })

  it('reads texts from branding.json', () => {
    writeFileSync(join(dir, 'branding.json'), JSON.stringify({
      brandName: 'Weingut Beispiel',
      websiteUrl: 'https://weingut.example',
      shareText: 'Mit uns: {titel}'
    }))
    expect(brandName()).toBe('Weingut Beispiel')
    expect(shareUrl()).toBe('https://weingut.example')
    expect(shareTextTemplate()).toBe('Mit uns: {titel}')
    expect(shareTextTemplate('de')).toBe('Mit uns: {titel}')
    expect(imprintUrl()).toBe('')
  })

  it('reads texts per language from branding.json', () => {
    writeFileSync(join(dir, 'branding.json'), JSON.stringify({
      brandName: 'Weingut Beispiel',
      shareText: { en: 'With us: {title}', de: 'Mit uns: {titel}' }
    }))
    expect(shareTextTemplate('en')).toBe('With us: {title}')
    expect(shareTextTemplate('de')).toBe('Mit uns: {titel}')
    expect(brandName('de')).toBe('Weingut Beispiel')
  })

  it('falls back to another language when one is missing', () => {
    writeFileSync(join(dir, 'branding.json'), JSON.stringify({ shareText: { de: 'Mit uns: {titel}' } }))
    expect(shareTextTemplate('en')).toBe('Mit uns: {titel}')
  })

  it('ignores an invalid branding.json', () => {
    writeFileSync(join(dir, 'branding.json'), '{ not json')
    expect(brandingTexts()).toEqual({})
    expect(brandName()).toBe('Photo Portal')
  })

  it('serves only known brand files', () => {
    const sent: string[] = []
    const res = { sendFile: (name: string, opts: { root: string }) => sent.push(join(opts.root, name)) }
    let skipped = 0
    const next = () => { skipped++ }
    const call = (file: string) => brandAsset({ params: { file } } as never, res as never, next)

    call('branding.json')
    call('..%2Fconfig.json')
    expect(skipped).toBe(2)
    expect(sent).toEqual([])

    call('logo-banner.png')
    expect(sent[0]).toContain(join('public', 'brand', 'logo-banner.png'))

    writeFileSync(join(dir, 'logo-banner.png'), 'x')
    call('logo-banner.png')
    expect(sent[1]).toBe(join(dir, 'logo-banner.png'))
  })
})
