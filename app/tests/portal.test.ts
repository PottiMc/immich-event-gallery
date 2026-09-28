import { describe, expect, it, beforeAll } from 'vitest'
import {
  duplicatePasswords,
  isWeakPassword,
  matchAccessToken,
  matchPassword,
  normalizePassword,
  PortalLink,
  portalLinks
} from '../src/portal/links'
import { accessToken } from '../src/portal/tokens'
import { LoginThrottle } from '../src/portal/throttle'
import { acceptedLang, languageMiddleware, negotiateLang, t } from '../src/portal/i18n'
import { shareTemplateFor, visibleDescription } from '../src/portal/gallery'
import { suggestPassword, WORDS } from '../src/portal/passwords'
import { SharedLink } from '../src/types'
import { resetBrandingCache } from '../src/portal/branding'
import { sourceUrl } from '../src/portal/settings'
import { BrandFooter, Landing, LicensePage } from '../src/portal/views'
import { h } from 'preact'
import { renderPage } from '../src/view/render'

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  // Neutral defaults, independent of a local app/branding folder
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

function link (overrides: Partial<PortalLink>): PortalLink {
  return {
    id: 'id-' + Math.random(),
    key: 'key-' + Math.random(),
    slug: null,
    password: 'riesling-karaffe-4827',
    description: null,
    type: 'ALBUM',
    createdAt: '2026-09-01T10:00:00.000Z',
    expiresAt: null,
    allowDownload: true,
    ...overrides
  }
}

describe('normalizePassword', () => {
  it('ignores case, spaces, hyphens, underscores and dots', () => {
    expect(normalizePassword(' Riesling Karaffe-4827 ')).toBe('rieslingkaraffe4827')
    expect(normalizePassword('riesling_karaffe.4827')).toBe('rieslingkaraffe4827')
  })

  it('keeps umlauts', () => {
    expect(normalizePassword('Süße-Traube')).toBe('süßetraube')
  })
})

describe('matchPassword', () => {
  it('finds the link regardless of how the guest typed it', () => {
    const target = link({})
    expect(matchPassword([link({ password: 'other-pass-1111' }), target], 'RIESLING karaffe 4827')).toBe(target)
  })

  it('ignores expired links and links without password', () => {
    const expired = link({ expiresAt: '2020-01-01T00:00:00.000Z' })
    const open = link({ password: null })
    expect(matchPassword([expired, open], 'riesling-karaffe-4827')).toBeUndefined()
    expect(portalLinks([expired, open])).toHaveLength(0)
  })

  it('rejects empty input', () => {
    expect(matchPassword([link({ password: '---' })], '')).toBeUndefined()
    expect(matchPassword([link({})], '   ')).toBeUndefined()
  })

  it('prefers the newest link on duplicate passwords and flags them', () => {
    const older = link({ createdAt: '2026-08-01T00:00:00.000Z' })
    const newer = link({ createdAt: '2026-09-20T00:00:00.000Z', password: 'Riesling Karaffe 4827' })
    expect(matchPassword([older, newer], 'riesling-karaffe-4827')).toBe(newer)
    expect(duplicatePasswords([older, newer, link({ password: 'unique-word-9999' })]))
      .toEqual(new Set([older.id, newer.id]))
  })
})

describe('access tokens', () => {
  it('opens the matching link and is bound to the password', () => {
    const target = link({})
    const token = accessToken(target.key, target.password!)
    expect(token).toMatch(/^[\w-]{24}$/)
    expect(matchAccessToken([link({}), target], token)).toBe(target)
    // Changing the password in Immich invalidates old QR codes
    expect(matchAccessToken([{ ...target, password: 'new-pass-1234' }], token)).toBeUndefined()
  })

  it('rejects malformed tokens', () => {
    expect(matchAccessToken([link({})], '../../etc/passwd')).toBeUndefined()
    expect(matchAccessToken([link({})], 'short')).toBeUndefined()
  })
})

describe('LoginThrottle', () => {
  it('blocks an IP after 5 failures and escalates the block', () => {
    let now = 0
    const t = new LoginThrottle({}, () => now)
    for (let i = 0; i < 4; i++) expect(t.fail('1.2.3.4').allowed).toBe(true)
    expect(t.remaining('1.2.3.4')).toBe(1)
    const blocked = t.fail('1.2.3.4')
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) expect(blocked.retryAfterSec).toBe(15 * 60)
    // Other IPs are unaffected
    expect(t.check('5.6.7.8').allowed).toBe(true)

    // After the first block expires, the next block is twice as long
    now += 15 * 60_000 + 1
    expect(t.check('1.2.3.4').allowed).toBe(true)
    for (let i = 0; i < 4; i++) t.fail('1.2.3.4')
    const second = t.fail('1.2.3.4')
    expect(second.allowed).toBe(false)
    if (!second.allowed) expect(second.retryAfterSec).toBe(30 * 60)
  })

  it('a correct password resets the failure counter', () => {
    const t = new LoginThrottle({}, () => 0)
    for (let i = 0; i < 4; i++) t.fail('ip')
    t.succeed('ip')
    expect(t.remaining('ip')).toBe(5)
  })

  it('pauses everyone when many IPs guess at once', () => {
    let now = 0
    const t = new LoginThrottle({ globalMaxFailures: 10, globalBlockMs: 60_000 }, () => now)
    for (let i = 0; i < 11; i++) t.fail('10.0.0.' + i)
    const decision = t.check('192.168.1.1')
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.global).toBe(true)
    now += 60_001
    expect(t.check('192.168.1.1').allowed).toBe(true)
  })

  it('formats wait times in English and German', () => {
    expect(t('en').wait(30)).toBe('a minute')
    expect(t('en').wait(15 * 60)).toBe('15 minutes')
    expect(t('en').wait(4 * 3600)).toBe('4 hours')
    expect(t('de').wait(30)).toBe('einer Minute')
    expect(t('de').wait(15 * 60)).toBe('15 Minuten')
    expect(t('de').wait(4 * 3600)).toBe('4 Stunden')
  })
})

describe('share text', () => {
  const share = (description: string): SharedLink => ({
    key: 'k',
    keyType: 'key' as SharedLink['keyType'],
    type: 'ALBUM',
    assets: [],
    expiresAt: null,
    album: { id: 'a', albumName: 'Weinwanderung', description }
  })

  it('uses the default template with the title filled in', () => {
    expect(shareTemplateFor(share(''), 'Wine hike', 'en'))
      .toBe('That was “Wine hike” – photo {number} of {total}')
    expect(shareTemplateFor(share(''), 'Weinwanderung', 'de'))
      .toBe('Das war „Weinwanderung“ – Bild {nr} von {anzahl}')
  })

  it('lets the album description override the text and hides that line', () => {
    const description = 'Danke fürs Mitwandern!\nTeilen: Das war die {titel} mit uns – Bild {nr}'
    expect(shareTemplateFor(share(description), 'Weinwanderung', 'de')).toBe('Das war die Weinwanderung mit uns – Bild {nr}')
    expect(visibleDescription(description)).toBe('Danke fürs Mitwandern!')
  })

  it('picks the album line for the page language, else any', () => {
    const description = 'Thanks!\nShare: The {title} with us – photo {number}\nTeilen: Die {titel} mit uns – Bild {nr}'
    expect(shareTemplateFor(share(description), 'Tour', 'en')).toBe('The Tour with us – photo {number}')
    expect(shareTemplateFor(share(description), 'Tour', 'de')).toBe('Die Tour mit uns – Bild {nr}')
    expect(visibleDescription(description)).toBe('Thanks!')
    expect(shareTemplateFor(share('Teilen: Nur {titel}'), 'Tour', 'en')).toBe('Nur Tour')
  })
})

describe('password suggestions', () => {
  it('builds word-word-digits from ASCII words', () => {
    for (let i = 0; i < 50; i++) {
      const pw = suggestPassword()
      expect(pw).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)
      expect(isWeakPassword(pw)).toBe(false)
    }
    expect(WORDS.length).toBeGreaterThan(180)
  })

  it('flags weak passwords', () => {
    expect(isWeakPassword('Weinprobe')).toBe(true)
    expect(isWeakPassword('1234567890')).toBe(true)
    expect(isWeakPassword('riesling-karaffe-4827')).toBe(false)
  })
})

describe('licence page', () => {
  it('is linked from the footer and links the source code', () => {
    expect(renderPage(h(BrandFooter, { lang: 'en' }))).toContain('href="/license"')
    expect(renderPage(h(BrandFooter, { lang: 'de' }))).toContain('href="/lizenz"')
    const page = renderPage(h(LicensePage, { lang: 'en' }))
    expect(page).toContain('href="' + sourceUrl() + '"')
    expect(page).toContain('Affero General Public License')
  })
})

describe('language', () => {
  it('reads the best supported language from Accept-Language', () => {
    expect(acceptedLang('de-DE,de;q=0.9,en;q=0.8')).toBe('de')
    expect(acceptedLang('fr-FR,fr;q=0.9,en;q=0.5,de;q=0.4')).toBe('en')
    expect(acceptedLang('en;q=0.2, de;q=0.8')).toBe('de')
    expect(acceptedLang('fr, es')).toBeUndefined()
    expect(acceptedLang(undefined)).toBeUndefined()
  })

  it('prefers the switcher cookie, then the browser, then English', () => {
    expect(negotiateLang('session=x; lang=de', 'en-US')).toBe('de')
    expect(negotiateLang('lang=xx', 'de-AT')).toBe('de')
    expect(negotiateLang(undefined, 'fr-FR')).toBe('en')
    expect(negotiateLang(undefined, undefined)).toBe('en')
  })

  function run (url: string, headers: Record<string, string> = {}) {
    const out: { redirect?: string, cookie?: [string, string], next: boolean, locals: Record<string, unknown> } = { next: false, locals: {} }
    const req = { method: 'GET', originalUrl: url, query: Object.fromEntries(new URL(url, 'http://x').searchParams), headers, secure: false }
    const res = {
      locals: out.locals,
      cookie: (name: string, value: string) => { out.cookie = [name, value] },
      set: () => {},
      redirect: (_status: number, to: string) => { out.redirect = to }
    }
    languageMiddleware(req as never, res as never, () => { out.next = true })
    return out
  }

  it('stores the switcher choice and redirects without ?lang', () => {
    const out = run('/share/abc?openItem=3&lang=de')
    expect(out.cookie).toEqual(['lang', 'de'])
    expect(out.redirect).toBe('/share/abc?openItem=3')
    expect(out.next).toBe(false)
  })

  it('ignores unknown languages and never redirects off-site', () => {
    const out = run('//evil.example/?lang=xx')
    expect(out.cookie).toBeUndefined()
    expect(out.redirect).toBe('/')
  })

  it('sets the language for normal requests', () => {
    const out = run('/', { 'accept-language': 'de' })
    expect(out.next).toBe(true)
    expect(out.locals.lang).toBe('de')
  })

  it('renders the landing page in the chosen language with a switcher', () => {
    const en = renderPage(h(Landing, { baseUrl: 'https://x', lang: 'en' }))
    expect(en).toContain('<html lang="en"')
    expect(en).toContain('View photos')
    expect(en).toContain('href="?lang=de"')
    const de = renderPage(h(Landing, { baseUrl: 'https://x', lang: 'de', error: 'throttled', retryAfterSec: 900 }))
    expect(de).toContain('<html lang="de"')
    expect(de).toContain('Bilder ansehen')
    expect(de).toContain('in 15 Minuten')
  })
})
