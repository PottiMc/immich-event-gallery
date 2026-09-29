/*
 * Brand colors on the pages. The operator sets four colors (branding.ts);
 * the shades the stylesheets need are derived here and laid over the CSS
 * defaults as custom properties in a <style> block after the stylesheets.
 *
 * A derived property is only written when one of the colors it depends on is
 * set, so without any brand colors the pages keep the hand-tuned defaults of
 * portal.css, gallery.css and card.css exactly. The stylesheets carry the
 * defaults either in :root or as var() fallbacks.
 */

import { BrandColors, brandColors, ColorKey } from './branding'

/** The defaults of portal.css (--eg-gold, --eg-berry, --eg-bg, --eg-text). */
export const DEFAULT_COLORS: Record<ColorKey, string> = {
  accent: '#ccac39',
  button: '#a3005a',
  background: '#0d0b0a',
  text: '#f4efe6'
}

type Rgb = [number, number, number]

const WHITE = '#ffffff'
const BLACK = '#000000'
/** Dark text on light buttons and badges, as in the stylesheets. */
const INK = '#1a1612'

function rgb (hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hex ([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** "r, g, b" for rgba(var(--…-rgb), alpha) in the stylesheets. */
function triplet (color: string): string {
  return rgb(color).join(', ')
}

/** Blend `amount` (0–1) of `other` into `color`. */
export function mix (color: string, other: string, amount: number): string {
  const a = rgb(color)
  const b = rgb(other)
  return hex([0, 1, 2].map(i => a[i] + (b[i] - a[i]) * amount) as Rgb)
}

/** Relative luminance as defined by WCAG. */
export function luminance (color: string): number {
  const [r, g, b] = rgb(color).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast (a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or dark text, whichever reads better on `background`. */
export function readableOn (background: string): string {
  return contrast(WHITE, background) >= contrast(INK, background) ? WHITE : INK
}

/** Move `color` towards `target` until it reaches `ratio` against `against` (or gets as close as it can). */
function untilContrast (color: string, target: string, against: string, ratio: number): string {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = mix(color, target, amount)
    if (contrast(candidate, against) >= ratio) return candidate
  }
  return target
}

export function isLight (color: string): boolean {
  return luminance(color) > 0.4
}

/** CSS custom properties for the set brand colors. */
export function themeVars (set: BrandColors = brandColors()): Record<string, string> {
  const c = { ...DEFAULT_COLORS, ...set }
  const vars: Record<string, string> = {}
  const add = (deps: ColorKey[], name: string, value: () => string) => {
    if (deps.some(key => key in set)) vars[name] = value()
  }
  const { accent, button, background, text } = c

  add(['accent'], '--eg-gold', () => accent)
  add(['accent'], '--eg-accent-rgb', () => triplet(accent))
  // Lighter shades move towards the text color: paler on dark pages, darker (and still readable) on light ones
  add(['accent', 'text'], '--eg-gold-light', () => mix(accent, text, 0.25))
  add(['accent', 'text'], '--eg-gold-bright', () => mix(accent, text, 0.45))
  add(['accent', 'text'], '--eg-on-accent', () => readableOn(mix(accent, text, 0.25)))
  // The accent on the white print card: darkened until it is readable on paper
  add(['accent'], '--eg-accent-print', () => untilContrast(accent, BLACK, WHITE, 4.5))

  add(['button'], '--eg-berry', () => button)
  add(['button'], '--eg-button-rgb', () => triplet(button))
  add(['button'], '--eg-berry-hover', () => mix(button, isLight(button) ? BLACK : WHITE, 0.12))
  add(['button'], '--eg-on-button', () => readableOn(button))
  add(['button'], '--eg-button-print', () => untilContrast(button, BLACK, WHITE, 4.5))
  // The button color as text on the page background (the dark print card)
  add(['button', 'background'], '--eg-button-bright', () =>
    untilContrast(button, isLight(background) ? BLACK : WHITE, background, 4.5))

  add(['background'], '--eg-bg', () => background)
  add(['background'], '--eg-bg-rgb', () => triplet(background))
  add(['background', 'text'], '--eg-surface', () => mix(background, text, 0.045))
  add(['background', 'text'], '--eg-surface-2', () => mix(background, text, 0.09))
  add(['background', 'text'], '--eg-surface-rgb', () => triplet(mix(background, text, 0.045)))

  add(['text'], '--eg-text', () => text)
  add(['text'], '--eg-text-rgb', () => triplet(text))
  add(['text', 'background'], '--eg-muted', () => mix(text, background, 0.27))
  add(['text', 'background'], '--eg-muted-rgb', () => triplet(mix(text, background, 0.27)))
  add(['text', 'background'], '--eg-placeholder', () => mix(text, background, 0.5))
  add(['text', 'background'], '--eg-card-alt', () => mix(text, background, 0.12))

  if ('background' in set) {
    vars['color-scheme'] = isLight(background) ? 'light' : 'dark'
    if (isLight(background)) {
      // Input fields are darkened on dark pages; on light pages they stay light
      vars['--eg-field'] = 'rgba(255, 255, 255, 0.7)'
      // The pale status colors are made for dark pages
      vars['--eg-error'] = '#b0004f'
      vars['--eg-success'] = '#2e7d4a'
    }
  }
  return vars
}

/** The <style> content for the pages, empty without brand colors. */
export function themeCss (set?: BrandColors): string {
  const vars = themeVars(set)
  const entries = Object.entries(vars)
  if (!entries.length) return ''
  return ':root { ' + entries.map(([name, value]) => `${name}: ${value};`).join(' ') + ' }'
}

/** Browser bar color on phones. */
export function themeColor (): string {
  return brandColors().background || DEFAULT_COLORS.background
}

/** Brand colors after the stylesheets. Colors are validated #rrggbb, so the CSS cannot break out of the block. */
export function ThemeStyle () {
  const css = themeCss()
  return css ? <style id="eg-theme">{css}</style> : null
}
