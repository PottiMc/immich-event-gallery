import { AssetType } from '../types'
import { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode, PortalClientConfig } from '../shared/types'
import { ASSET_VERSION } from '../version'
import { jsonForInlineScript } from '../utils/text'
import type { PortalGalleryData } from '../portal/gallery'
import { BrandFooter, STATIC } from '../portal/views'
import { BRAND } from '../portal/branding'
import { brandName } from '../portal/settings'

export type { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode }

export interface GalleryProps {
  items: GalleryItem[]
  title: string
  description: string
  publicBaseUrl: string
  path: string
  showDownloadZip: boolean
  showTitle: boolean
  // Formatted "available until" date shown in the subtitle, or undefined when
  // ipp.gallery.showExpiryDate is off or the share never expires.
  expiryDate?: string
  openItem?: number
  ogImageItem?: GalleryItem
  lightboxConfig: LightboxConfig
  metadataConfig: MetadataConfig
  groupByDate: GroupByDateMode | false
  metaBase?: string
  // Portal: album access link, QR code and share texts
  portal?: PortalGalleryData
}

/** "48 Fotos · 3 Videos" */
function countLabel (items: GalleryItem[]): string {
  const videos = items.filter(item => item.type === AssetType.video).length
  const photos = items.length - videos
  const parts: string[] = []
  if (photos) parts.push(photos + (photos === 1 ? ' Foto' : ' Fotos'))
  if (videos) parts.push(videos + (videos === 1 ? ' Video' : ' Videos'))
  return parts.join(' · ') || 'Noch keine Bilder'
}

const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z"/></svg>'

export function Gallery (props: GalleryProps) {
  const portal: PortalClientConfig | undefined = props.portal && {
    accessUrl: props.portal.accessUrl,
    shareTemplate: props.portal.shareTemplate,
    shareUrl: props.portal.shareUrl,
    albumShareText: props.portal.albumShareText,
    title: props.title
  }
  const initJson = jsonForInlineScript({
    items: props.items,
    openItem: props.openItem,
    lightboxConfig: props.lightboxConfig,
    metadataConfig: props.metadataConfig,
    groupByDate: props.groupByDate,
    metaBase: props.metaBase,
    portal
  })
  const firstItem = props.items[0]
  // og:image prefers the album cover (passed via props); for videos, previewUrl
  // points to the .mp4, so use thumbnailUrl to keep og:image a still JPEG.
  const ogItem = props.ogImageItem || firstItem
  const ogImageAsset = ogItem
    ? (ogItem.type === AssetType.video ? ogItem.thumbnailUrl : ogItem.previewUrl)
    : ''
  const ogImageUrl = ogItem ? props.publicBaseUrl + ogImageAsset : ''
  const pageTitle = (props.title || 'Galerie') + ' – ' + brandName()

  return (
    <html lang="de" class="dark">
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex, nofollow"/>
        <meta name="theme-color" content="#0d0b0a"/>
        <title>{pageTitle}</title>
        <meta property="og:title" content={pageTitle}/>
        <meta name="twitter:title" content={pageTitle}/>
        {props.description && <>
          <meta name="description" content={props.description}/>
          <meta property="og:description" content={props.description}/>
          <meta property="twitter:description" content={props.description}/>
        </>}
        {firstItem && <>
          <meta property="og:image" content={ogImageUrl}/>
          <meta name="twitter:image" content={ogImageUrl}/>
          <meta name="twitter:card" content="summary_large_image"/>
        </>}
        <link rel="icon" href="/favicon.ico" sizes="any"/>
        <link rel="icon" href={`${BRAND}/icon-192.png`} type="image/png"/>
        <link rel="apple-touch-icon" href={`${BRAND}/apple-touch-icon.png`}/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/style.css`}/>
        <link type="text/css" rel="stylesheet" href="/share/static/photoswipe/photoswipe.css"/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/photoswipe-overrides.css`}/>
        <link type="text/css" rel="stylesheet" href={`${STATIC}/portal/gallery.css`}/>
      </head>
      <body>
        <div class="eg-brandbar">
          <a href="/" class="eg-brandbar-logo" aria-label={brandName() + ' – Startseite'}>
            <img src={`${BRAND}/logo-banner.png`} alt={brandName()} width="183" height="71"/>
          </a>
        </div>
        <header id="header">
          <div class="header-text">
            {props.showTitle && <h1>{props.title || 'Galerie'}</h1>}
            <p class="subtitle">
              {countLabel(props.items)}
              {props.expiryDate && (
                <>{' · online bis '}{props.expiryDate}</>
              )}
            </p>
          </div>
          <div class="eg-header-actions">
            {props.portal && (
              <button id="eg-album-share" type="button" class="eg-pill" aria-haspopup="dialog">
                <span dangerouslySetInnerHTML={{ __html: ICON_SHARE }}/>
                <span class="eg-pill-label">Album teilen</span>
              </button>
            )}
            {props.showDownloadZip && (
              <a id="download-all" class="eg-pill" href={props.path + '/download'} title="Alle Bilder als ZIP herunterladen" aria-label="Alle Bilder herunterladen">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                </svg>
                <span class="eg-pill-label">Alle laden</span>
              </a>
            )}
          </div>
        </header>
        {props.description && (
          <p id="album-description">{props.description}</p>
        )}
        {props.items.length > 0 && (
          <p class="eg-tip">Tipp: Bild antippen und über <span dangerouslySetInnerHTML={{ __html: ICON_SHARE }}/> direkt per WhatsApp teilen.</p>
        )}
{/* Container is intentionally empty - web.js's virtualisation manager
            populates it with only the tiles within the viewport buffer. */}
        <div id="gallery"></div>
        {props.showDownloadZip && (
          <div id="select-toolbar" hidden>
            <button id="select-cancel" class="toolbar-btn" type="button" aria-label="Auswahl beenden">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
              </svg>
            </button>
            <span id="select-count">0 ausgewählt</span>
            <button id="select-all" class="toolbar-btn-text" type="button">Alle auswählen</button>
            <button id="select-download" class="toolbar-btn" type="button" aria-label="Auswahl herunterladen">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
              </svg>
            </button>
          </div>
        )}
        <BrandFooter/>
        {props.portal && (
          <dialog id="eg-share-dialog" class="eg-dialog" aria-labelledby="eg-share-title">
            <form method="dialog" class="eg-dialog-close-form">
              <button class="eg-dialog-close" aria-label="Schließen">×</button>
            </form>
            <h2 id="eg-share-title">Album teilen</h2>
            <p>Lass andere Gäste diesen Code mit der Handykamera scannen – dann sind sie ohne Passwort direkt im Album.</p>
            <div class="eg-dialog-qr" dangerouslySetInnerHTML={{ __html: props.portal.qrSvg }}/>
            <div class="eg-dialog-actions">
              <button type="button" id="eg-album-share-link" class="eg-button">Link teilen</button>
              <button type="button" id="eg-album-copy-link" class="eg-button eg-button-ghost">Link kopieren</button>
            </div>
            <p class="eg-dialog-note">Bitte nur an Leute weitergeben, die auch dabei waren. 🙂</p>
          </dialog>
        )}
        <div id="eg-toast" role="status" aria-live="polite" hidden></div>
        {/* Init params for web.js (read at module load). Using a JSON script
            block avoids the cross-script-type coordination problems that come
            with mixing classic and module scripts. */}
        <script
          type="application/json"
          id="ipp-init"
          dangerouslySetInnerHTML={{ __html: initJson }}
        />
        <script type="module" src={`/share/static/${ASSET_VERSION}/js/client/init.js`}></script>
      </body>
    </html>
  )
}
