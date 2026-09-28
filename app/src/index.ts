#!/usr/bin/env node

import 'dotenv/config'
import express from 'express'
import cookieSession from 'cookie-session'
import {
  accessible,
  enforceMinimumImmichVersion,
  fetchAssetDetail,
  getKeyTypeFromShare,
  getShareByKey,
  handleShareRequest,
  isId,
  isKey
} from './immich'
import { buildAssetMetadata } from './gallery/metadata'
import { assetBuffer } from './stream/asset'
import { downloadAssets } from './stream/download'
import dayjs from 'dayjs'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, KeyType, SharedLink } from './types'
import { getConfigOption } from './config/access'
import { loadConfig } from './config/loader'
import { addResponseHeaders, asyncHandler, errorHandler } from './http'
import { canDownload, findMotionPhotoStill } from './share'
import { toString } from './utils/text'
import { decrypt } from './encrypt'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { ASSET_VERSION } from './version'
import { registerPortalRoutes, unlockShare } from './portal/routes'
import { startAdminServer } from './portal/admin'
import { securityHeaders } from './portal/security'
import { BRAND, brandAsset, sendBrandFile } from './portal/branding'
import { deriveKey, trustProxy } from './portal/settings'
import { loadRuntimeSettings } from './portal/runtime-settings'

// Extend the Request type with a `password` property
declare module 'express-serve-static-core' {
  interface Request {
    password?: string;
  }
}

// Read config.json (or the inline CONFIG env var) and apply backward-compat
// migrations. Must run before any code that calls getConfigOption.
loadConfig()
// Settings changed on the admin page (DATA_DIR/settings.json) take precedence
loadRuntimeSettings()

const app = express()
// Behind a reverse proxy: take the visitor IP from X-Forwarded-For
// (needed for the login rate limit) and the protocol from X-Forwarded-Proto
app.set('trust proxy', trustProxy())
// Flat query strings only - nothing here needs qs's nested objects/arrays
app.set('query parser', 'simple')
app.use(securityHeaders)
app.use(cookieSession({
  name: 'session',
  httpOnly: true,
  sameSite: 'lax',
  // Derived from PORTAL_SECRET so guests stay logged in across restarts
  secret: deriveKey('cookie-session').toString('base64url')
}))
// Mark the cookie Secure whenever the visitor came in over HTTPS (as reported
// by the trusted proxy). Setting `secure: true` statically would make
// cookie-session throw on plain-HTTP requests, e.g. local tests.
app.use((req, _res, next) => {
  if (req.sessionOptions) req.sessionOptions.secure = req.secure
  next()
})
// For parsing the password unlock form and POSTed JSON payloads
app.use(express.json())
// For parsing the selective-download form POST (form-encoded body)
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
// Brand assets: the operator's files from BRANDING_DIR, else neutral defaults
app.get(BRAND + '/:file', brandAsset)
app.get('/favicon.ico', (_req, res) => sendBrandFile(res, 'favicon.ico'))
// Cache-busted, immutable static assets under a per-release version segment.
const inProduction = process.env.NODE_ENV === 'production'
app.use('/share/static/' + ASSET_VERSION, express.static('public', {
  immutable: inProduction,
  maxAge: inProduction ? '365d' : 0,
  setHeaders: addResponseHeaders
}))
// Serve static assets from the 'public' folder as /share/static
app.use('/share/static', express.static('public', { setHeaders: addResponseHeaders }))
// Serve the same assets on /, to allow for /robots.txt and /favicon.ico
app.use(express.static('public', { setHeaders: addResponseHeaders }))
// Remove the X-Powered-By ExpressJS header
app.disable('x-powered-by')

/**
 * Middleware to decode the encrypted data stored in the session cookie
 */
const decodeCookie = (req: Request, _res: Response, next: NextFunction) => {
  const shareKey = req.params.key
  const session = req.session?.[shareKey]
  if (shareKey && session?.iv && session?.cr) {
    try {
      const payload = JSON.parse(decrypt({
        iv: toString(session.iv),
        cr: toString(session.cr)
      }))
      if (payload?.expires && dayjs(payload.expires) > dayjs()) {
        req.password = payload.password
      }
    } catch (e) { }
  }
  next()
}

/*
 * Shared route guards. Several routes need the same "resolve a share, reject
 * invalid / password-protected ones, optionally find the requested asset"
 * preamble. These return a discriminated result so each route keeps control of
 * its own response (e.g. the photo route redirects on password where the meta
 * and download routes return 401), while the validation order and the
 * `valid`/`link`/`passwordRequired` checks live in one place.
 */
type ShareResolution =
  | { ok: true, link: SharedLink }
  | { ok: false, status: number, reason: string, passwordRequired?: boolean }

type SharedAssetResolution =
  | { ok: true, link: SharedLink, asset: Asset }
  | { ok: false, status: number, reason: string, passwordRequired?: boolean }

async function resolveShare (req: Request, keyType: KeyType): Promise<ShareResolution> {
  if (!isKey(req.params.key)) {
    return { ok: false, status: 404, reason: 'Invalid key for ' + req.path }
  }
  // The password is provided from the encrypted session cookie (if set) by
  // decodeCookie. Validating the share here prevents direct URL access from
  // bypassing password protection.
  const share = await getShareByKey(req.params.key, req.password, keyType)
  if (!share?.valid || !share.link) {
    return { ok: false, status: 404, reason: 'Invalid share link' }
  }
  if (share.passwordRequired) {
    return { ok: false, status: 401, reason: 'Password required', passwordRequired: true }
  }
  return { ok: true, link: share.link }
}

async function resolveSharedAsset (req: Request, keyType: KeyType, allowMotion = false): Promise<SharedAssetResolution> {
  if (!isId(req.params.id)) {
    return { ok: false, status: 404, reason: 'Invalid ID for ' + req.path }
  }
  const resolved = await resolveShare(req, keyType)
  if (!resolved.ok) return resolved
  // Confirm the asset belongs to this share (defence in depth - Immich also
  // enforces this via the share key).
  const asset = resolved.link.assets.find(a => a.id === req.params.id)
  if (asset) return { ok: true, link: resolved.link, asset }
  // A motion photo's clip is a hidden asset outside the share's asset list.
  // Serve it on the video route only, and only if a shared still points at it.
  if (allowMotion) {
    const parent = findMotionPhotoStill(resolved.link, req.params.id)
    if (parent) {
      return {
        ok: true,
        link: resolved.link,
        // Streams inline, so the still's filename / mime must not carry over.
        asset: { ...parent, id: req.params.id, type: AssetType.video, originalFileName: undefined, originalMimeType: undefined }
      }
    }
  }
  return { ok: false, status: 404, reason: 'Asset not found in share' }
}

/*
 * Slug links (/s/...) are guessable. When disabled, refuse them on every
 * route - not just the gallery page - so no route can be probed with a slug.
 */
app.all(/^\/s\//, (req, res, next) => {
  if (getConfigOption('ipp.allowSlugLinks', true)) {
    next()
  } else {
    respondToInvalidRequest(res, 404, 'Slug links are disabled in config.json')
  }
})

/*
 * [ROUTE] Healthcheck
 * The path matches for /share/healthcheck, and also the legacy /healthcheck
 */
app.get(/^(|\/share)\/healthcheck$/, asyncHandler(async (_req, res) => {
  if (await accessible()) {
    res.send('ok')
  } else {
    res.status(503).send()
  }
}))

/*
 * [ROUTE] This is the main URL that someone would visit if they are opening a shared link
 */
app.get('/:shareType(share|s)/:key/:mode(download)?', decodeCookie, asyncHandler(async (req, res) => {
  const keyType = getKeyTypeFromShare(req.params.shareType)

  if (keyType === KeyType.slug && !getConfigOption('ipp.allowSlugLinks', true)) {
    // Slug type links are not allowed
    respondToInvalidRequest(res, 404, 'Slug links are disabled in config.json')
  } else {
    await handleShareRequest({
      req,
      key: req.params.key,
      keyType,
      mode: req.params.mode,
      password: req.password
    }, res)
  }
}))

/*
 * [ROUTE] Receive an unlock request from the password page.
 * The password is verified (and rate-limited) before it is stored in the
 * encrypted session cookie - see unlockShare.
 *
 * The data is encrypted/decrypted on the server as a db-less way of
 * managing user session data. The data is provided to the server by the
 * user's browser in its encrypted state.
 */
app.post('/share/unlock', asyncHandler(unlockShare))

/*
 * [ROUTE] Selective download - POST a list of asset IDs, get a zip of just those.
 * The list arrives as a single "assets" form field containing a JSON array.
 * Validates each ID against share.assets so the request can't pull anything
 * outside the share.
 */
app.post('/:shareType(share|s)/:key/download', decodeCookie, asyncHandler(async (req, res) => {
  const keyType = getKeyTypeFromShare(req.params.shareType)
  let requestedIds: unknown
  try {
    requestedIds = JSON.parse(String(req.body?.assets ?? '[]'))
  } catch (e) {
    respondToInvalidRequest(res, 400, 'Malformed assets list')
    return
  }
  if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
    respondToInvalidRequest(res, 400, 'No assets selected')
    return
  }

  const resolved = await resolveShare(req, keyType)
  if (!resolved.ok) {
    respondToInvalidRequest(res, resolved.status, resolved.reason)
    return
  }
  if (!canDownload(resolved.link)) {
    respondToInvalidRequest(res, 403, 'Downloads disabled for this share')
    return
  }

  const requested = new Set(requestedIds.map(String))
  const validAssets = resolved.link.assets.filter(a => requested.has(a.id))
  if (validAssets.length === 0) {
    respondToInvalidRequest(res, 400, 'No valid assets in selection')
    return
  }

  await downloadAssets(res, resolved.link, validAssets)
}))

/*
 * [ROUTE] Catch accidental POST requests to share URLs (e.g. from browser history
 * state issues) and force a clean GET redirect.
 * See https://github.com/alangrainger/immich-public-proxy/pull/205
 */
app.post('/:shareType(share|s)/:key/:mode(download)?', (req, res) => {
  res.redirect(303, req.originalUrl)
})

/*
 * [ROUTE] This is the direct link to a photo or video asset
 */
app.get('/share/:type(photo|video)/:key/:id/:size?', decodeCookie, asyncHandler(async (req, res) => {
  // Add the headers configured in config.json (most likely `cache-control`)
  addResponseHeaders(res)

  // Validate the size parameter
  if (req.params.size && !Object.values(ImageSize).includes(req.params.size as ImageSize)) {
    respondToInvalidRequest(res, 404, 'Invalid size parameter ' + req.path)
    return
  }

  // Resolve the share + asset (this is a `/share/...` route, always key auth).
  // The resolved asset gives assetBuffer access to originalMimeType and
  // originalFileName (needed for Content-Disposition and for requiresOriginal
  // to recognise videos/animated images and bypass the preview downgrade).
  const resolved = await resolveSharedAsset(req, KeyType.key, req.params.type === 'video')
  if (!resolved.ok) {
    // Password-protected: redirect to the share page so the visitor gets the
    // unlock prompt, rather than returning an error.
    if (resolved.passwordRequired) {
      res.redirect('/share/' + req.params.key)
      return
    }
    respondToInvalidRequest(res, resolved.status, resolved.reason)
    return
  }
  const asset: Asset = {
    ...resolved.asset,
    type: req.params.type === 'video' ? AssetType.video : resolved.asset.type
  }

  const request = {
    req,
    key: req.params.key,
    range: req.headers.range || ''
  }
  await assetBuffer(request, res, asset, req.params.size, resolved.link, req.params.type === 'video')
}))

/*
 * [ROUTE] On-demand per-asset metadata for lazy album items.
 *
 * Album shares enumerate their assets from the timeline API, which yields
 * grid-only data (no exif / filename / description). When such an item opens
 * in the lightbox, the client fetches its detail from here. The id is
 * validated against the share's asset set (defence in depth - Immich also
 * enforces this via the share key) before we fetch `GET /assets/:id`.
 */
app.get('/:shareType(share|s)/meta/:key/:id', decodeCookie, asyncHandler(async (req, res) => {
  addResponseHeaders(res)

  const resolved = await resolveSharedAsset(req, getKeyTypeFromShare(req.params.shareType))
  if (!resolved.ok) {
    respondToInvalidRequest(res, resolved.status, resolved.reason)
    return
  }

  const detail = await fetchAssetDetail(resolved.asset)
  if (!detail) {
    respondToInvalidRequest(res, 404, 'Asset detail unavailable for ' + req.params.id)
    return
  }

  res.json(buildAssetMetadata(detail, resolved.link))
}))

/*
 * [ROUTE] Password portal: landing page with password field,
 * password login and QR access links. Replaces IPP's home page.
 */
registerPortalRoutes(app)
app.get(/^\/share\/*$/, (_req, res) => res.redirect('/'))

/*
 * Send a 404 for all other routes
 */
app.get('*', (req, res) => {
  respondToInvalidRequest(res, 404, 'Invalid route ' + req.path)
})

/*
 * Terminal error middleware: any throw/rejection inside a route (routed here
 * by asyncHandler) is logged and answered per the 404 privacy policy, instead
 * of escaping to process level.
 */
app.use(errorHandler)

// Send the correct process error code for any uncaught exceptions
// so that Docker can gracefully restart the container
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err)
  server.close()
  process.exit(1)
})
// Log-only: with asyncHandler routing request errors into errorHandler, a
// stray rejection from a background task (the version check, etc.) is not
// worth killing every in-flight request for.
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Gracefully shutting down...')
  server.close()
  process.exit(0)
})

// Start the ExpressJS server
const port = Number(process.env.IPP_PORT) || 3000
const server = app.listen(port, () => {
  console.log(dayjs().format() + ' Server started on port ' + port)
  // Bail out early if the Immich server is older than IPP supports, rather
  // than silently serving broken album shares. Unknown/unreachable is
  // tolerated (logs a warning and continues) - see enforceMinimumImmichVersion.
  enforceMinimumImmichVersion().catch(e => console.error('Immich version check failed:', e))
})
startAdminServer()
