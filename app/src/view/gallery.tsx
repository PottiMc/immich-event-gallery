import { AssetType } from '../types'
import { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode, PortalClientConfig } from '../shared/types'
import { ASSET_VERSION } from '../version'
import { jsonForInlineScript } from '../utils/text'
import type { PortalGalleryData } from '../portal/gallery'
import { BrandFooter, LangSwitch, STATIC } from '../portal/views'
import { brandUrl } from '../portal/branding'
import { brandName, newsletterText, privacyUrl } from '../portal/settings'
import { MAX_EMAIL } from '../portal/mail'
import { MAX_NAME, newsletterEnabled } from '../portal/newsletter'
import { newsletterAfter } from '../portal/runtime-settings'
import { Lang, t } from '../portal/i18n'
import { themeColor, ThemeStyle } from '../portal/theme'
import { CLIENT_MESSAGES } from '../shared/i18n'
import { MAX_PHOTOS, MIN_DETAILS, REMOVAL_REASONS } from '../portal/removal'

export type { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode }

export interface GalleryProps {
  lang: Lang
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

/** "48 photos · 3 videos" */
function countLabel (items: GalleryItem[], lang: Lang): string {
  const m = t(lang).gallery
  const videos = items.filter(item => item.type === AssetType.video).length
  const photos = items.length - videos
  const parts: string[] = []
  if (photos) parts.push(m.photos(photos))
  if (videos) parts.push(m.videos(videos))
  return parts.join(' · ') || m.empty
}

const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z"/></svg>'

const ICON_REMOVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.3,21H5C3.9,21 3,20.1 3,19V5C3,3.9 3.9,3 5,3H19C20.1,3 21,3.9 21,5V13.3C20.4,13.1 19.7,13 19,13C17.9,13 16.8,13.3 15.9,13.9L14.5,12L11,16.5L8.5,13.5L5,18H13.1C13,18.3 13,18.7 13,19C13,19.7 13.1,20.4 13.3,21M20.4,19L22.5,21.1L21.1,22.5L19,20.4L16.9,22.5L15.5,21.1L17.6,19L15.5,16.9L16.9,15.5L19,17.6L21.1,15.5L22.5,16.9L20.4,19Z"/></svg>'

const ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20,8L12,13L4,8V6L12,11L20,6M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z"/></svg>'

/**
 * Newsletter sign-up band. It sits inside #gallery; the client layout moves
 * it between the photo rows (after `data-after` photos) and posts the form.
 */
function NewsletterBand ({ lang, path }: { lang: Lang, path: string }) {
  const m = t(lang).newsletter
  const privacy = privacyUrl()
  return (
    <section id="eg-newsletter" class="eg-newsletter" aria-labelledby="eg-newsletter-title"
      data-endpoint={path + '/newsletter'} data-after={String(newsletterAfter())}
      data-sending={m.sending} data-sent={m.sent} data-failed={m.failed}>
      <div class="eg-newsletter-text">
        <span class="eg-newsletter-icon" dangerouslySetInnerHTML={{ __html: ICON_MAIL }}/>
        <div>
          <h2 id="eg-newsletter-title">{m.heading}</h2>
          <p>{newsletterText(lang)}</p>
        </div>
      </div>
      <form id="eg-newsletter-form" class="eg-newsletter-form">
        <div class="eg-newsletter-fields">
          <label class="eg-sr-only" for="eg-newsletter-email">{m.emailLabel}</label>
          <input id="eg-newsletter-email" name="email" type="email" required maxLength={MAX_EMAIL}
            autoComplete="email" placeholder={m.emailLabel}/>
          <label class="eg-sr-only" for="eg-newsletter-name">{m.nameLabel}</label>
          <input id="eg-newsletter-name" name="name" type="text" maxLength={MAX_NAME}
            autoComplete="given-name" placeholder={m.nameLabel}/>
          <button type="submit" class="eg-button">{m.submit}</button>
        </div>
        <p class="eg-newsletter-privacy">
          {m.privacy}
          {privacy && <>{' '}<a href={privacy} target="_blank" rel="noopener">{m.privacyLink}</a></>}
        </p>
        <p class="eg-newsletter-error" role="alert" hidden></p>
      </form>
      <p class="eg-newsletter-done" role="status" hidden></p>
    </section>
  )
}

/** Dialog for asking the operator to remove photos (privacy). */
function RemovalDialog ({ lang, path }: { lang: Lang, path: string }) {
  const m = t(lang).removal
  const client = CLIENT_MESSAGES[lang]
  return (
    <dialog id="eg-removal-dialog" class="eg-dialog eg-removal" aria-labelledby="eg-removal-title"
      data-endpoint={path + '/removal-request'} data-max={String(MAX_PHOTOS)}>
      <form method="dialog" class="eg-dialog-close-form">
        <button class="eg-dialog-close" aria-label={m.close}>×</button>
      </form>
      <h2 id="eg-removal-title">{m.title}</h2>
      <div id="eg-removal-step-select">
        <p>{m.intro}</p>
        <p class="eg-removal-policy">{m.policy}</p>
        <p class="eg-removal-hint">{m.selectHint}</p>
        <div id="eg-removal-grid" class="eg-removal-grid" role="group" aria-label={m.selectHint}></div>
        <div class="eg-removal-bar">
          <span id="eg-removal-count" aria-live="polite">{client.selected(0)}</span>
          <button type="button" id="eg-removal-next" class="eg-button" disabled>{m.next}</button>
        </div>
      </div>
      <form id="eg-removal-form" class="eg-removal-form" hidden>
        <fieldset>
          <legend>{m.reasonLegend}</legend>
          {REMOVAL_REASONS.map(reason => (
            <label class="eg-removal-choice" key={reason}>
              <input type="radio" name="reason" value={reason} required/>
              <span>{m.reasons[reason]}</span>
            </label>
          ))}
        </fieldset>
        <label class="eg-removal-field">
          <span>{m.detailsLabel}</span>
          <textarea name="details" rows={4} required minLength={MIN_DETAILS} maxLength={2000}
            placeholder={m.detailsPlaceholder}></textarea>
        </label>
        <label class="eg-removal-field">
          <span>{m.nameLabel}</span>
          <input type="text" name="name" required minLength={2} maxLength={100} autoComplete="name"/>
        </label>
        <label class="eg-removal-field">
          <span>{m.emailLabel}</span>
          <input type="email" name="email" required maxLength={200} autoComplete="email"/>
          <small>{m.emailHint}</small>
        </label>
        <label class="eg-removal-choice eg-removal-confirm">
          <input type="checkbox" name="confirm" required/>
          <span>{m.confirm}</span>
        </label>
        <p id="eg-removal-error" class="eg-error" role="alert" hidden></p>
        <div class="eg-removal-bar">
          <button type="button" id="eg-removal-back" class="eg-button eg-button-ghost">{m.back}</button>
          <button type="submit" id="eg-removal-submit" class="eg-button">{m.submit}</button>
        </div>
      </form>
      <div id="eg-removal-done" hidden>
        <p class="eg-removal-done-heading">{m.doneHeading}</p>
        <p>{m.doneText}</p>
        <form method="dialog">
          <button class="eg-button eg-button-block">{m.close}</button>
        </form>
      </div>
    </dialog>
  )
}

export function Gallery (props: GalleryProps) {
  const { lang } = props
  const m = t(lang)
  const client = CLIENT_MESSAGES[lang]
  const brand = brandName(lang)
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
  const pageTitle = (props.title || m.gallery.fallbackTitle) + ' – ' + brand

  return (
    <html lang={m.htmlLang} class="dark">
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex, nofollow"/>
        <meta name="theme-color" content={themeColor()}/>
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
        <link rel="icon" href={brandUrl('favicon.ico')} sizes="any"/>
        <link rel="icon" href={brandUrl('icon-192.png')} type="image/png"/>
        <link rel="apple-touch-icon" href={brandUrl('apple-touch-icon.png')}/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/style.css`}/>
        <link type="text/css" rel="stylesheet" href="/share/static/photoswipe/photoswipe.css"/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/photoswipe-overrides.css`}/>
        <link type="text/css" rel="stylesheet" href={`${STATIC}/portal/gallery.css`}/>
        <ThemeStyle/>
      </head>
      <body>
        <div class="eg-brandbar">
          <a href="/" class="eg-brandbar-logo" aria-label={brand + ' – ' + m.home}>
            <img src={brandUrl('logo-banner.png')} alt={brand} width="183" height="71"/>
          </a>
          <LangSwitch lang={lang} class="eg-lang-corner"/>
        </div>
        <header id="header">
          <div class="header-text">
            {props.showTitle && <h1>{props.title || m.gallery.fallbackTitle}</h1>}
            <p class="subtitle">
              {countLabel(props.items, lang)}
              {props.expiryDate && (
                <>{' · ' + m.gallery.onlineUntil + ' '}{props.expiryDate}</>
              )}
            </p>
          </div>
          <div class="eg-header-actions">
            {props.portal && (
              <button id="eg-album-share" type="button" class="eg-pill" aria-haspopup="dialog">
                <span dangerouslySetInnerHTML={{ __html: ICON_SHARE }}/>
                <span class="eg-pill-label">{m.gallery.shareAlbum}</span>
              </button>
            )}
            {props.showDownloadZip && (
              <a id="download-all" class="eg-pill" href={props.path + '/download'} title={m.gallery.downloadAllTitle} aria-label={m.gallery.downloadAllAria}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                </svg>
                <span class="eg-pill-label">{m.gallery.downloadAllLabel}</span>
              </a>
            )}
            {props.portal?.removalEnabled && props.items.length > 0 && (
              <button id="eg-removal-open" type="button" class="eg-pill eg-pill-quiet" aria-haspopup="dialog"
                title={m.removal.buttonTitle}>
                <span dangerouslySetInnerHTML={{ __html: ICON_REMOVE }}/>
                <span class="eg-pill-label">{m.removal.button}</span>
              </button>
            )}
          </div>
        </header>
        {props.description && (
          <p id="album-description">{props.description}</p>
        )}
        {props.items.length > 0 && (
          <p class="eg-tip">{m.gallery.tip(<span dangerouslySetInnerHTML={{ __html: ICON_SHARE }}/>)}</p>
        )}
{/* web.js's virtualisation manager populates the container with only
            the tiles within the viewport buffer. The only static child is the
            portal's newsletter band, which the layout places between rows. */}
        <div id="gallery">
          {props.portal && props.items.length > 0 && newsletterEnabled() && <NewsletterBand lang={lang} path={props.path}/>}
        </div>
        {props.showDownloadZip && (
          <div id="select-toolbar" hidden>
            <button id="select-cancel" class="toolbar-btn" type="button" aria-label={m.gallery.selectCancel}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
              </svg>
            </button>
            <span id="select-count">{client.selected(0)}</span>
            <button id="select-all" class="toolbar-btn-text" type="button">{client.selectAll}</button>
            <button id="select-download" class="toolbar-btn" type="button" aria-label={m.gallery.selectDownload}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
              </svg>
            </button>
          </div>
        )}
        <BrandFooter lang={lang}/>
        {props.portal && (
          <dialog id="eg-share-dialog" class="eg-dialog" aria-labelledby="eg-share-title">
            <form method="dialog" class="eg-dialog-close-form">
              <button class="eg-dialog-close" aria-label={m.gallery.close}>×</button>
            </form>
            <h2 id="eg-share-title">{m.gallery.shareAlbum}</h2>
            <p>{m.gallery.dialogText}</p>
            <div class="eg-dialog-qr" dangerouslySetInnerHTML={{ __html: props.portal.qrSvg }}/>
            <div class="eg-dialog-actions">
              <button type="button" id="eg-album-share-link" class="eg-button">{m.gallery.shareLink}</button>
              <button type="button" id="eg-album-copy-link" class="eg-button eg-button-ghost">{m.gallery.copyLink}</button>
            </div>
            <p class="eg-dialog-note">{m.gallery.dialogNote}</p>
          </dialog>
        )}
        {props.portal?.removalEnabled && props.items.length > 0 && (
          <RemovalDialog lang={lang} path={props.path}/>
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
