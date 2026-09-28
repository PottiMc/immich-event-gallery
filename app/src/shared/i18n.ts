/*
 * Languages of the guest and admin UI, plus the texts of the gallery client
 * (lightbox, info panel, selection toolbar, share button). Server-rendered
 * texts live in portal/i18n.ts. English is the primary language.
 */

export type Lang = 'en' | 'de'

export const LANGS: readonly Lang[] = ['en', 'de']

export function isLang (value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

const en = {
  locale: 'en-GB',
  backToGallery: 'Back to gallery',
  download: 'Download',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  playMotion: 'Play live photos',
  pauseMotion: 'Pause live photos',
  imageInfo: 'Image information',
  info: 'Info',
  closeInfo: 'Close info',
  noInfo: 'No information available',
  details: 'Details',
  openInOsm: 'Open in OpenStreetMap',
  undated: 'Undated',
  selected: (n: number) => `${n} selected`,
  selectAll: 'Select all',
  selectNone: 'Select none',
  shareImage: 'Share image',
  shareImageTitle: 'Share image (e.g. via WhatsApp)',
  shareFailed: 'Sharing didn’t work – please try again.',
  preparingImage: 'Preparing image …',
  imageReady: 'Image is ready – please tap Share again.',
  linkCopied: 'Link copied ✓',
  copyLinkPrompt: 'Link to copy:',
  fileBaseName: 'photo'
}

export type ClientMessages = typeof en

const de: ClientMessages = {
  locale: 'de-DE',
  backToGallery: 'Zurück zur Galerie',
  download: 'Herunterladen',
  fullscreen: 'Vollbild',
  exitFullscreen: 'Vollbild beenden',
  playMotion: 'Live-Fotos abspielen',
  pauseMotion: 'Live-Fotos anhalten',
  imageInfo: 'Bildinformationen',
  info: 'Info',
  closeInfo: 'Info schließen',
  noInfo: 'Keine Informationen verfügbar',
  details: 'Details',
  openInOsm: 'In OpenStreetMap öffnen',
  undated: 'Ohne Datum',
  selected: (n: number) => `${n} ausgewählt`,
  selectAll: 'Alle auswählen',
  selectNone: 'Keine auswählen',
  shareImage: 'Bild teilen',
  shareImageTitle: 'Bild teilen (z.B. per WhatsApp)',
  shareFailed: 'Teilen hat nicht geklappt – versuch es nochmal.',
  preparingImage: 'Bild wird vorbereitet …',
  imageReady: 'Bild ist bereit – bitte nochmal auf Teilen tippen.',
  linkCopied: 'Link kopiert ✓',
  copyLinkPrompt: 'Link zum Kopieren:',
  fileBaseName: 'bild'
}

export const CLIENT_MESSAGES: Record<Lang, ClientMessages> = { en, de }
