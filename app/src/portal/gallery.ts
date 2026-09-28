/*
 * Portal extras for the gallery page: album access link + QR code (for guests
 * to pass on), and the WhatsApp / share text.
 */

import QRCode from 'qrcode'
import { SharedLink } from '../types'
import { accessToken } from './tokens'
import { shareTextTemplate, shareUrl } from './settings'
import { Lang, t } from './i18n'

export interface PortalGalleryData {
  // Link that opens this album without typing the password (QR target)
  accessUrl: string
  // Inline SVG of the QR code for accessUrl
  qrSvg: string
  // Share text with the title already filled in; {number}/{nr} and
  // {total}/{anzahl} are filled in by the client per image
  shareTemplate: string
  // Link appended to shared images
  shareUrl: string
  // Text used when sharing the album link itself
  albumShareText: string
}

// Album description lines that set the share text: "Share: ..." for English
// guests, "Teilen: ..." for German ones
const SHARE_LINE = /^\s*(share|teilen)\s*:\s*(.+)$/im
const SHARE_KEYWORD: Record<Lang, string> = { en: 'share', de: 'teilen' }

/**
 * Album description without the "Share: ..." / "Teilen: ..." lines (they only
 * configure the share text and should not be shown to guests).
 */
export function visibleDescription (description: string): string {
  return description.split(/\r?\n/).filter(line => !SHARE_LINE.test(line)).join('\n').trim()
}

/** The custom share text from the album description: this language's line first, else any. */
function customShareText (description: string, lang: Lang): string | undefined {
  const lines = description.split(/\r?\n/)
    .map(line => line.match(SHARE_LINE))
    .filter((m): m is RegExpMatchArray => !!m)
  const own = lines.find(m => m[1].toLowerCase() === SHARE_KEYWORD[lang])
  return (own || lines[0])?.[2]?.trim() || undefined
}

/**
 * Share text for this album: a "Share: ..." / "Teilen: ..." line in the Immich
 * album description wins over the default from branding.json / config.json.
 */
export function shareTemplateFor (share: SharedLink, title: string, lang: Lang): string {
  const custom = customShareText(share.album?.description || '', lang)
  return (custom || shareTextTemplate(lang)).split('{title}').join(title).split('{titel}').join(title)
}

export function accessUrlFor (share: SharedLink, baseUrl: string): string {
  // Links without a password are already public via their key
  return share.password
    ? `${baseUrl}/z/${accessToken(share.key, share.password)}`
    : `${baseUrl}/share/${share.key}`
}

export function qrSvg (url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' }
  })
}

export async function portalGalleryData (share: SharedLink, title: string, baseUrl: string, lang: Lang): Promise<PortalGalleryData> {
  const accessUrl = accessUrlFor(share, baseUrl)
  return {
    accessUrl,
    qrSvg: await qrSvg(accessUrl),
    shareTemplate: shareTemplateFor(share, title, lang),
    shareUrl: shareUrl(),
    albumShareText: t(lang).gallery.albumShareText(title)
  }
}
