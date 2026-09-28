import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { albumAssetCount, PortalLink } from '../src/portal/links'

// Immich 3.0 lists every album share with `assetCount: 0`; the admin page
// counts through the timeline buckets instead.

let keyCounter = 0
function albumLink (overrides: Partial<PortalLink> = {}): PortalLink {
  return {
    id: 'link-' + keyCounter,
    // albumAssetCount caches by key; a fresh key per test avoids cross-test reuse
    key: 'count-key-' + (keyCounter++),
    slug: null,
    password: null,
    description: null,
    type: 'ALBUM',
    createdAt: '2026-09-01T00:00:00.000Z',
    expiresAt: null,
    allowDownload: true,
    album: { id: 'album-1', albumName: 'Fest', assetCount: 0 },
    ...overrides
  }
}

function jsonResponse (body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('albumAssetCount', () => {
  beforeEach(() => {
    process.env.IMMICH_URL = 'http://immich.test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sums the timeline buckets of the album', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse([
      { timeBucket: '2026-08-01', count: 150 },
      { timeBucket: '2026-09-01', count: 46 }
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const link = albumLink()
    expect(await albumAssetCount(link)).toBe(196)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/api/timeline/buckets')
    expect(url.searchParams.get('albumId')).toBe('album-1')
    expect(url.searchParams.get('key')).toBe(link.key)
  })

  it('returns undefined when Immich refuses, and does not cache the failure', async () => {
    const link = albumLink()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'nope' }, 401)))
    expect(await albumAssetCount(link)).toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ timeBucket: '2026-09-01', count: 3 }])))
    expect(await albumAssetCount(link)).toBe(3)
  })

  it('skips expired links and individual shares without asking Immich', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await albumAssetCount(albumLink({ expiresAt: '2020-01-01T00:00:00.000Z' }))).toBeUndefined()
    expect(await albumAssetCount(albumLink({ type: 'INDIVIDUAL', album: undefined }))).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
