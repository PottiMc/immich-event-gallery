import { beforeAll, describe, expect, it } from 'vitest'
import { h } from 'preact'
import { cardOptions, splitTitleDate } from '../src/portal/card'
import { PrintCard } from '../src/portal/admin-views'
import { resetBrandingCache } from '../src/portal/branding'
import { renderPage } from '../src/view/render'

beforeAll(() => {
  process.env.BRANDING_DIR = 'tests/no-branding'
  resetBrandingCache()
})

describe('splitTitleDate', () => {
  it('splits a trailing date off the title', () => {
    expect(splitTitleDate('Weinwanderung Saarwellingen - 24.09.2026'))
      .toEqual({ title: 'Weinwanderung Saarwellingen', date: '24.09.2026' })
    expect(splitTitleDate('Tasting – 2026-09-24')).toEqual({ title: 'Tasting', date: '2026-09-24' })
    expect(splitTitleDate('Summer party 1.8.26')).toEqual({ title: 'Summer party', date: '1.8.26' })
  })

  it('keeps titles without a trailing date', () => {
    expect(splitTitleDate(' Wine hike 2026 ')).toEqual({ title: 'Wine hike 2026', date: '' })
    expect(splitTitleDate('24.09.2026')).toEqual({ title: '24.09.2026', date: '' })
  })
})

describe('cardOptions', () => {
  it('defaults to four cards on A4 with title and date from the share', () => {
    expect(cardOptions({}, 'Wine hike - 24.09.2026'))
      .toEqual({ title: 'Wine hike', date: '24.09.2026', dark: false, layout: 'sheet' })
  })

  it('reads title, date, colour and layout from the query', () => {
    expect(cardOptions({ titel: ' Autumn tasting ', datum: '3 Oct', dunkel: '', format: 'a6' }, 'Wine hike'))
      .toEqual({ title: 'Autumn tasting', date: '3 Oct', dark: true, layout: 'single' })
  })

  it('allows clearing the date but not the title', () => {
    expect(cardOptions({ titel: '', datum: '' }, 'Wine hike - 24.09.2026'))
      .toMatchObject({ title: 'Wine hike', date: '' })
  })

  it('ignores repeated parameters and limits the length', () => {
    const options = cardOptions({ titel: ['a', 'b'], datum: 'x'.repeat(500) }, 'Wine hike')
    expect(options.title).toBe('Wine hike')
    expect(options.date).toHaveLength(120)
  })
})

describe('PrintCard', () => {
  const props = {
    lang: 'de' as const,
    defaultTitle: 'Wine hike',
    query: 'titel=Wine+hike',
    password: 'vanille-barrique-8335',
    hostLabel: 'photos.example.com',
    qrSvg: '<svg></svg>'
  }

  it('renders four cards with crop marks on an A4 sheet', () => {
    const html = renderPage(h(PrintCard, { ...props, options: { title: 'Wine <hike>', date: '24.09.2026', dark: false, layout: 'sheet' } }))
    expect(html.match(/<section class="card">/g)).toHaveLength(4)
    expect(html.match(/class="mark /g)).toHaveLength(12)
    expect(html).toContain('Wine &lt;hike>')
    expect(html).toContain('vanille-barrique-8335')
    expect(html).not.toContain('size: 105mm')
  })

  it('renders a single A6 card and hides an empty date', () => {
    const html = renderPage(h(PrintCard, { ...props, options: { title: 'Wine hike', date: '', dark: true, layout: 'single' } }))
    expect(html.match(/<section class="card">/g)).toHaveLength(1)
    expect(html).toContain('size: 105mm 148mm')
    expect(html).toMatch(/class="card-date" hidden/)
    expect(html).toContain('?titel=Wine+hike&amp;lang=en')
  })
})
