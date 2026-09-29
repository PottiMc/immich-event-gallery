import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import dayjs from 'dayjs'
import { Request } from 'express-serve-static-core'
import { adminFormToken, createAdminApp } from '../src/portal/admin'
import { buildBuckets, buildRows, mergeDays, QUIET_DAYS } from '../src/portal/admin-stats'
import { niceScale } from '../src/portal/admin-stats-views'
import { resetBrandingCache } from '../src/portal/branding'
import { PortalLink } from '../src/portal/links'
import {
  allStats,
  deleteShareStats,
  flushStats,
  recordDownload,
  recordLogin,
  recordView,
  resetStatsForTests,
  ShareStats,
  today
} from '../src/portal/stats'

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'

function guest (ip: string, agent: string | null = PHONE): Request {
  return { ip, headers: agent === null ? {} : { 'user-agent': agent }, socket: {} } as unknown as Request
}

const share = { id: 'share-1', description: null, album: { albumName: 'Weinwanderung' } }

function link (id: string, extra: Partial<PortalLink> = {}): PortalLink {
  return {
    id,
    key: 'key-' + id,
    slug: null,
    password: 'riesling-1234',
    description: null,
    type: 'ALBUM',
    createdAt: dayjs().subtract(30, 'day').toISOString(),
    expiresAt: null,
    allowDownload: true,
    album: { id: 'album-' + id, albumName: 'Album ' + id },
    ...extra
  }
}

function day (daysAgo: number): string {
  return dayjs().subtract(daysAgo, 'day').format('YYYY-MM-DD')
}

let dir: string

beforeAll(() => {
  process.env.PORTAL_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PORTAL_ADMIN_PASSWORD = 'admin-test-password'
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eg-stats-'))
  process.env.DATA_DIR = dir
  resetStatsForTests()
})

afterEach(() => {
  resetStatsForTests()
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  delete process.env.DATA_DIR
})

describe('recording', () => {
  it('counts every page view, but each visitor once per day', () => {
    recordView(guest('203.0.113.7'), share)
    recordView(guest('203.0.113.7'), share)
    recordView(guest('198.51.100.2'), share)
    // Same /64 and browser: the same guest hopping between IPv6 addresses
    recordView(guest('2001:db8:1:2::10'), share)
    recordView(guest('2001:db8:1:2::99'), share)
    const counts = allStats()['share-1'].days[today()]
    expect(counts).toEqual({ views: 5, visitors: 3 })
    expect(allStats()['share-1'].title).toBe('Weinwanderung')
  })

  it('leaves out link previews, bots and requests without a browser', () => {
    recordView(guest('203.0.113.7', 'WhatsApp/2.23.20.0 A'), share)
    recordView(guest('203.0.113.7', 'facebookexternalhit/1.1'), share)
    recordView(guest('203.0.113.7', 'TelegramBot (like TwitterBot)'), share)
    recordView(guest('203.0.113.7', 'curl/8.4.0'), share)
    recordView(guest('203.0.113.7', null), share)
    recordLogin(guest('203.0.113.7', 'WhatsApp/2.23.20.0 A'), share, 'qr')
    expect(allStats()['share-1']).toBeUndefined()
  })

  it('counts logins, single downloads and ZIPs with their files', () => {
    recordLogin(guest('203.0.113.7'), share, 'password')
    recordLogin(guest('203.0.113.8'), share, 'qr')
    recordLogin(guest('203.0.113.9'), share, 'qr')
    recordDownload(guest('203.0.113.7'), share, 1, false)
    recordDownload(guest('203.0.113.7'), share, 48, true)
    expect(allStats()['share-1'].days[today()]).toEqual({ logins: 1, qr: 2, downloads: 49, zips: 1 })
  })

  it('ignores links without an id', () => {
    recordView(guest('203.0.113.7'), { description: 'x' })
    recordDownload(guest('203.0.113.7'), {}, 3, true)
    expect(allStats()).toEqual({})
  })

  it('stores only counts and reads them back after a restart', () => {
    recordView(guest('203.0.113.7'), share)
    recordDownload(guest('203.0.113.7'), share, 2, true)
    expect(flushStats()).toBe(true)
    const raw = readFileSync(join(dir, 'stats.json'), 'utf8')
    expect(raw).not.toContain('203.0.113')
    expect(raw).not.toContain('iPhone')

    resetStatsForTests()
    expect(allStats()['share-1'].days[today()]).toEqual({ views: 1, visitors: 1, downloads: 2, zips: 1 })
  })

  it('drops invalid entries and very old days when loading', () => {
    writeFileSync(join(dir, 'stats.json'), JSON.stringify({
      shares: {
        a: { title: 'A', days: { [day(1)]: { visitors: 3, views: -2, bogus: 9 }, [day(800)]: { visitors: 1 }, 'not-a-day': { visitors: 1 } } },
        b: 'broken'
      }
    }))
    expect(allStats()).toEqual({ a: { title: 'A', days: { [day(1)]: { visitors: 3 } } } })
  })

  it('deletes the statistics of a share', () => {
    recordView(guest('203.0.113.7'), share)
    expect(deleteShareStats('share-1')).toBe(true)
    expect(deleteShareStats('share-1')).toBe(false)
    resetStatsForTests()
    expect(allStats()).toEqual({})
  })
})

describe('evaluation', () => {
  const stats: Record<string, ShareStats> = {
    busy: { title: 'Busy', days: { [day(0)]: { visitors: 4, downloads: 10 }, [day(3)]: { visitors: 2 }, [day(9)]: { visitors: 1 } } },
    quiet: { title: 'Quiet', days: { [day(QUIET_DAYS + 5)]: { visitors: 7, downloads: 3 } } },
    gone: { title: 'Gone album', days: { [day(40)]: { visitors: 5 } } }
  }

  it('builds zero-filled daily buckets with a 7-day average', () => {
    const { buckets, weekly } = buildBuckets(mergeDays(Object.values(stats)), '30')
    expect(weekly).toBe(false)
    expect(buckets).toHaveLength(30)
    expect(buckets[29]).toMatchObject({ start: day(0), counts: { visitors: 4, downloads: 10 } })
    expect(buckets[28].counts.visitors).toBe(0)
    // Today: 4 + 2 (3 days ago) over 7 days
    expect(buckets[29].average).toBeCloseTo(6 / 7, 1)
  })

  it('switches to weeks for long periods', () => {
    const old: ShareStats = { title: 'Old', days: { [day(200)]: { visitors: 3 }, [day(0)]: { visitors: 1 } } }
    const { buckets, weekly } = buildBuckets(mergeDays([old]), 'all')
    expect(weekly).toBe(true)
    expect(buckets.length).toBeGreaterThanOrEqual(29)
    expect(dayjs(buckets[0].start).day()).toBe(1)
    expect(buckets.reduce((sum, b) => sum + b.counts.visitors, 0)).toBe(4)
  })

  it('marks shares nobody visits any more and keeps deleted ones', () => {
    const rows = buildRows([link('busy'), link('quiet'), link('new', { createdAt: dayjs().toISOString() }), link('idle')], stats)
    const row = (id: string) => rows.find(r => r.id === id)!
    expect(row('busy')).toMatchObject({ status: 'active', visitors7: 6, visitorsPrev7: 1, visitorsTotal: 7, downloadsTotal: 10, quiet: false, lastVisit: day(0) })
    expect(row('quiet')).toMatchObject({ quiet: true, daysSinceVisit: QUIET_DAYS + 5 })
    // Created today and not visited yet: too early to call it unused
    expect(row('new')).toMatchObject({ quiet: false, visitorsTotal: 0 })
    // Online for 30 days and never visited
    expect(row('idle')).toMatchObject({ quiet: true, daysSinceVisit: undefined })
    expect(row('gone')).toMatchObject({ status: 'deleted', title: 'Gone album', quiet: false })
    expect(row('busy').spark).toHaveLength(30)
    expect(rows[0].id).toBe('busy')
    expect(rows[rows.length - 1].id).toBe('gone')
  })

  it('picks round axis steps', () => {
    expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] })
    expect(niceScale(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] })
    expect(niceScale(13)).toEqual({ top: 15, ticks: [0, 5, 10, 15] })
    expect(niceScale(380).ticks).toEqual([0, 100, 200, 300, 400])
  })
})

describe('admin page', () => {
  let server: http.Server
  let base: string
  const auth = { authorization: 'Basic ' + Buffer.from('admin:admin-test-password').toString('base64') }

  beforeAll(async () => {
    server = http.createServer(createAdminApp())
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('shows charts, tiles and the share table in both languages', async () => {
    recordView(guest('203.0.113.7'), share)
    recordDownload(guest('203.0.113.7'), share, 12, true)
    const de = await (await fetch(base + '/statistik', { headers: { ...auth, 'accept-language': 'de' } })).text()
    expect(de).toContain('Besucher pro Tag')
    expect(de).toContain('Heruntergeladene Bilder pro Tag')
    expect(de).toContain('Weinwanderung')
    expect(de).toContain('in Immich gelöscht')
    expect(de).toContain('class="st-col"')
    expect(de).toContain('aria-current="page">Statistik')
    const en = await (await fetch(base + '/statistik?zeitraum=90&freigabe=share-1', { headers: { ...auth, 'accept-language': 'en' } })).text()
    expect(en).toContain('Visitors per day')
    expect(en).toContain('st-selected')
    expect((en.match(/class="st-col"/g) || []).length).toBe(180)
  })

  it('needs the admin login', async () => {
    const res = await fetch(base + '/statistik', { redirect: 'manual' })
    expect(res.status).not.toBe(200)
  })

  it('deletes statistics only with a valid form token', async () => {
    recordView(guest('203.0.113.7'), share)
    const post = (fields: Record<string, string>) => fetch(base + '/statistik/loeschen', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
      body: new URLSearchParams(fields).toString(),
      redirect: 'manual'
    })
    expect((await post({ id: 'share-1', csrf: 'wrong' })).status).toBe(400)
    expect(allStats()['share-1']).toBeDefined()
    const res = await post({ id: 'share-1', csrf: adminFormToken() })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/statistik?geloescht')
    expect(allStats()['share-1']).toBeUndefined()
    expect(existsSync(join(dir, 'stats.json'))).toBe(true)
  })
})
