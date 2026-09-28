/*
 * Portal extras for the gallery page: album access link + QR code (for guests
 * to pass on), and the WhatsApp / share text.
 */

import QRCode from 'qrcode'
import { SharedLink } from '../types'
import { accessToken } from './tokens'
import { shareTextTemplate, shareUrl } from './settings'

export interface PortalGalleryData {
  // Link that opens this album without typing the password (QR target)
  accessUrl: string
  // Inline SVG of the QR code for accessUrl
  qrSvg: string
  // Share text with {titel} already filled in; {nr} and {anzahl} are filled
  // in by the client per image
  shareTemplate: string
  // Link appended to shared images
  shareUrl: string
  // Text used when sharing the album link itself
  albumShareText: string
}

const SHARE_LINE = /^\s*teilen\s*:\s*(.+)$/im

/**
 * Album description without the "Teilen: ..." line (that line only configures
 * the share text and should not be shown to guests).
 */
export function visibleDescription (description: string): string {
  return description.split(/\r?\n/).filter(line => !SHARE_LINE.test(line)).join('\n').trim()
}

/**
 * Share text for this album: a "Teilen: ..." line in the Immich album
 * description wins over the default from config.json.
 */
export function shareTemplateFor (share: SharedLink, title: string): string {
  const custom = (share.album?.description || '').match(SHARE_LINE)?.[1]?.trim()
  return (custom || shareTextTemplate()).split('{titel}').join(title)
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

export async function portalGalleryData (share: SharedLink, title: string, baseUrl: string): Promise<PortalGalleryData> {
  const accessUrl = accessUrlFor(share, baseUrl)
  return {
    accessUrl,
    qrSvg: await qrSvg(accessUrl),
    shareTemplate: shareTemplateFor(share, title),
    shareUrl: shareUrl(),
    albumShareText: `Hier sind die Bilder von „${title}“ 📸`
  }
}
