/*
 * Admin server on its own port (default 3001). Not meant to be public:
 * publish it only behind reverse-proxy authentication (e.g. SSO). The login with
 * PORTAL_ADMIN_PASSWORD (admin-auth.ts) is the second lock. Disabled when no
 * password is set.
 */

import dayjs from 'dayjs'
import express from 'express'
import { h } from 'preact'
import QRCode from 'qrcode'
import { asyncHandler } from '../http'
import { log } from '../utils/log'
import { ASSET_VERSION } from '../version'
import { renderPage } from '../view/render'
import { AdminLinkView, AdminPage, PrintCard } from './admin-views'
import { albumAssetCount, duplicatePasswords, isExpired, isWeakPassword, linkTitle, listSharedLinks, PortalLink } from './links'
import { suggestPassword } from './passwords'
import { BRAND, brandAsset, sendBrandFile } from './branding'
import { adminPassword, adminPort, publicBaseUrl, publicHostLabel, trustProxy } from './settings'
import { downloadQuality, isDownloadQuality, saveRuntimeSettings, settingsPersistent } from './runtime-settings'
import { Lang, langOf, languageMiddleware, t } from './i18n'
import { securityHeaders } from './security'
import { accessToken } from './tokens'
import { qrSvg } from './gallery'
import { adminFormToken, validFormPost } from './admin-forms'
import { registerLoginRoutes, requireAdmin } from './admin-auth'
import { registerBrandingRoutes } from './admin-branding'
import { registerStatsRoutes } from './admin-stats'
import { registerNewsletterAdminRoutes } from './admin-newsletter'
import { cardOptions, splitTitleDate } from './card'

export { adminFormToken }

function linkAccessUrl (link: PortalLink, baseUrl: string): string {
  return link.password
    ? `${baseUrl}/z/${accessToken(link.key, link.password)}`
    : `${baseUrl}/share/${link.key}`
}

function expiresText (link: PortalLink, lang: Lang): string {
  const m = t(lang)
  if (!link.expiresAt) return m.admin.noExpiry
  const date = dayjs(link.expiresAt)
  return (date.isBefore(dayjs()) ? m.admin.expiredOn : m.admin.onlineUntil) + ' ' + date.format(m.dateFormat)
}

async function linkCount (link: PortalLink): Promise<number | undefined> {
  if (link.type === 'ALBUM') {
    const counted = await albumAssetCount(link)
    if (counted !== undefined) return counted
    // Immich 3.0 always lists 0 here, so only trust a positive value
    return link.album?.assetCount || undefined
  }
  return Array.isArray(link.assets) && link.assets.length ? link.assets.length : undefined
}

async function toView (link: PortalLink, baseUrl: string, duplicates: Set<string>, lang: Lang): Promise<AdminLinkView> {
  const status = isExpired(link) ? 'expired' : link.password ? 'active' : 'no-password'
  const accessUrl = linkAccessUrl(link, baseUrl)
  return {
    id: link.id,
    title: linkTitle(link),
    albumName: link.album?.albumName,
    kind: link.type === 'ALBUM' ? t(lang).admin.kindAlbum : t(lang).admin.kindAssets,
    count: await linkCount(link),
    createdAt: link.createdAt,
    expiresText: expiresText(link, lang),
    password: link.password,
    accessUrl,
    galleryUrl: `${baseUrl}/share/${link.key}`,
    qrSvg: status === 'expired' ? '' : await qrSvg(accessUrl),
    status,
    weak: !!link.password && isWeakPassword(link.password),
    duplicate: duplicates.has(link.id),
    neverExpires: !link.expiresAt
  }
}

const STATUS_ORDER = { active: 0, 'no-password': 1, expired: 2 }

function adminBaseUrl (): { baseUrl: string, missing: boolean } {
  const env = publicBaseUrl()
  return env ? { baseUrl: env, missing: false } : { baseUrl: 'https://bilder.example.com', missing: true }
}

async function findLink (id: string): Promise<PortalLink | undefined> {
  const list = await listSharedLinks(0)
  return list.ok ? list.links.find(l => l.id === id) : undefined
}

/** The admin app without listening, so tests can mount it. */
export function createAdminApp () {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', trustProxy())
  app.set('query parser', 'simple')
  app.use(securityHeaders)
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  // Brand files first: public/brand/ holds the neutral defaults of the same names
  app.get(BRAND + '/:file', brandAsset)
  // Static assets are public anyway (the guest app serves the same files)
  app.use('/share/static/' + ASSET_VERSION, express.static('public'))
  app.use('/share/static', express.static('public'))
  app.get('/favicon.ico', (_req, res) => sendBrandFile(res, 'favicon.ico'))
  app.use(languageMiddleware)
  registerLoginRoutes(app)
  app.use(requireAdmin)

  app.get('/', asyncHandler(async (req, res) => {
    const lang = langOf(res)
    const { baseUrl, missing } = adminBaseUrl()
    const list = await listSharedLinks(0)
    let views: AdminLinkView[] = []
    if (list.ok) {
      const duplicates = duplicatePasswords(list.links)
      views = await Promise.all(list.links.map(link => toView(link, baseUrl, duplicates, lang)))
      views.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt))
    }
    res.send(renderPage(h(AdminPage, {
      lang,
      links: views,
      error: list.ok ? undefined : list.message,
      baseUrl,
      baseUrlMissing: missing,
      suggestions: Array.from({ length: 6 }, suggestPassword),
      helpOpen: 'vorschlaege' in req.query,
      settings: {
        downloadQuality: downloadQuality(),
        persistent: settingsPersistent(),
        saved: 'gespeichert' in req.query,
        notPersisted: 'nicht-dauerhaft' in req.query,
        csrf: adminFormToken()
      }
    })))
  }))

  app.post('/einstellungen', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const quality = req.body?.downloadQuality
    if (!validFormPost(req) || !isDownloadQuality(quality)) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    const result = saveRuntimeSettings({ downloadQuality: quality })
    log('Admin: guest download quality set to ' + quality)
    res.redirect(303, (result.ok ? '/?gespeichert' : '/?nicht-dauerhaft') + '#einstellungen')
  })

  registerBrandingRoutes(app)
  registerStatsRoutes(app)
  registerNewsletterAdminRoutes(app)

  app.get('/qr/:id.:format(png|svg)', asyncHandler(async (req, res) => {
    const link = await findLink(req.params.id)
    if (!link || isExpired(link)) {
      res.status(404).send(t(langOf(res)).admin.shareNotFound)
      return
    }
    const url = linkAccessUrl(link, adminBaseUrl().baseUrl)
    const filename = 'qr-' + linkTitle(link).replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
    if (req.params.format === 'svg') {
      res.type('image/svg+xml')
      res.attachment(filename + '.svg')
      res.send(await qrSvg(url))
    } else {
      res.type('image/png')
      res.attachment(filename + '.png')
      res.send(await QRCode.toBuffer(url, { type: 'png', width: 1200, margin: 2, errorCorrectionLevel: 'M' }))
    }
  }))

  app.get('/karte/:id', asyncHandler(async (req, res) => {
    const link = await findLink(req.params.id)
    if (!link || isExpired(link)) {
      res.status(404).send(t(langOf(res)).admin.shareNotFound)
      return
    }
    const { baseUrl } = adminBaseUrl()
    const query = new URL(req.originalUrl, 'http://localhost').searchParams
    query.delete('lang')
    res.send(renderPage(h(PrintCard, {
      lang: langOf(res),
      options: cardOptions(req.query, linkTitle(link)),
      defaultTitle: splitTitleDate(linkTitle(link)).title,
      query: query.toString(),
      password: link.password,
      hostLabel: publicHostLabel(baseUrl),
      qrSvg: await qrSvg(linkAccessUrl(link, baseUrl))
    })))
  }))

  return app
}

export function startAdminServer () {
  if (!adminPassword()) {
    log('Admin page disabled (PORTAL_ADMIN_PASSWORD not set)')
    return
  }
  const port = adminPort()
  createAdminApp().listen(port, () => log('Admin page started on port ' + port))
}
