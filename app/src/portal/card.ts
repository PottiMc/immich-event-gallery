/*
 * Printable guest card: options from the query string. Title and date can be
 * edited on the card page; the defaults come from the share title.
 */

export type CardLayout = 'sheet' | 'single'

export interface CardOptions {
  title: string
  date: string
  dark: boolean
  layout: CardLayout
}

const MAX_LENGTH = 120

// A date at the end of the title, e.g. "Wine hike - 24.09.2026" or "Tasting 2026-09-24"
const TRAILING_DATE = /^(.*?\S)(?:\s+|\s*[-–—|·,:]\s*)(\d{1,2}\.\s?\d{1,2}\.\s?(?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})$/

/** Split a share title into title and date when it ends with a date. */
export function splitTitleDate (title: string): { title: string, date: string } {
  const match = TRAILING_DATE.exec(title.trim())
  return match ? { title: match[1], date: match[2] } : { title: title.trim(), date: '' }
}

function queryText (value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim().slice(0, MAX_LENGTH) : undefined
}

/**
 * Card options: `titel`, `datum`, `dunkel` and `format=a6` (single A6 card;
 * default is four cards on an A4 sheet with crop marks).
 */
export function cardOptions (query: Record<string, unknown>, shareTitle: string): CardOptions {
  const defaults = splitTitleDate(shareTitle)
  return {
    title: queryText(query.titel) || defaults.title,
    date: queryText(query.datum) ?? defaults.date,
    dark: 'dunkel' in query,
    layout: query.format === 'a6' ? 'single' : 'sheet'
  }
}
