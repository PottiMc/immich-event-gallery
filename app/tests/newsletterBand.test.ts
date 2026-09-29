import { afterEach, describe, expect, it } from 'vitest'
import { BAND_GAP, GAP, state } from '../src/client/state'
import { computeLayout } from '../src/client/layout'
import type { GalleryItem } from '../src/shared/types'

/*
 * Portal: the newsletter band between the photo rows. It follows the row of
 * photo number `after`, never cuts a row in half, and everything below moves
 * down by its height.
 */

function items (n: number): GalleryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i,
    type: 'IMAGE',
    previewUrl: '',
    thumbnailUrl: '',
    downloadFilename: '',
    width: 1000,
    height: 1000
  }))
}

function withBand (after: number, height = 200) {
  state.band = { el: {} as HTMLElement, after, height, top: 0 }
}

describe('newsletter band layout', () => {
  afterEach(() => {
    state.band = null
    state.items = []
  })

  it('sits after the row of the n-th photo on a phone (3 columns)', () => {
    state.items = items(30)
    const plain = computeLayout(390)
    const tile = plain.layout[0].height
    withBand(12)
    const result = computeLayout(390)
    // Four full rows, then the band
    expect(result.bandTop).toBe(4 * tile + 3 * GAP + BAND_GAP)
    expect(result.layout[11].top).toBe(plain.layout[11].top)
    expect(result.layout[12].top).toBe(plain.layout[12].top + 200 + 2 * BAND_GAP)
    expect(result.totalHeight).toBe(plain.totalHeight + 200 + 2 * BAND_GAP)
  })

  it('finishes the row instead of splitting it', () => {
    state.items = items(30)
    withBand(11)
    const result = computeLayout(390)
    // Photo 11 is in the fourth row, so photo 12 stays next to it
    expect(result.layout[11].top).toBe(result.layout[10].top)
    expect(result.layout[12].top).toBeGreaterThan(result.bandTop!)
  })

  it('goes to the end of short albums', () => {
    state.items = items(5)
    const plain = computeLayout(1200)
    withBand(12, 150)
    const result = computeLayout(1200)
    expect(result.bandTop).toBe(plain.totalHeight + BAND_GAP)
    expect(result.totalHeight).toBe(plain.totalHeight + BAND_GAP + 150)
    expect(result.layout.map(l => l.top)).toEqual(plain.layout.map(l => l.top))
  })
})
