/*
 * Branding page of the admin server: brand texts and links, colors, logos and icons.
 */

import { ComponentChildren } from 'preact'
import { AdminHeader } from './admin-views'
import { BrandSource, MAX_BRAND_FILE_BYTES } from './branding'
import { Lang, Messages, t } from './i18n'
import { brandName } from './settings'
import { BrandHead, STATIC } from './views'

export interface BrandTextValues {
  brandName: string
  websiteUrl: string
  imprintUrl: string
  privacyUrl: string
  shareUrl: string
  shareTextEn: string
  shareTextDe: string
  newsletterTextEn: string
  newsletterTextDe: string
  phone: string
  instagramUrl: string
}

export interface ColorView {
  key: string
  label: string
  hint: string
  /** #rrggbb that applies now */
  value: string
  /** What applies without the admin page's color: branding folder or default */
  fallback: string
  source: BrandSource
}

export interface ImageView {
  name: string
  label: string
  usage: string
  url: string
  source: BrandSource
  recommended: string
  current?: string
  ratioWarning: boolean
  accept: string
  /** Meant for a light background (preview on white) */
  light: boolean
}

export interface BrandingPageProps {
  lang: Lang
  csrf: string
  persistent: boolean
  baseUrl: string
  values: BrandTextValues
  sources: Record<keyof BrandTextValues, BrandSource>
  hasAdminTexts: boolean
  notice?: 'saved' | 'texts-reset'
  error?: string
  colors: ColorView[]
  hasAdminColors: boolean
  colorNotice?: 'saved' | 'reset'
  colorError?: string
  contrastWarnings: string[]
  images: ImageView[]
  imageNotice?: { name: string, kind: 'saved' | 'reset' }
}

function SourceBadge ({ source, m }: { source: BrandSource, m: Messages }) {
  const label = source === 'admin' ? m.branding.sourceAdmin : source === 'folder' ? m.branding.sourceFolder : m.branding.sourceDefault
  return <span class={'adm-badge adm-source adm-source-' + source}>{label}</span>
}

interface FieldProps {
  name: keyof BrandTextValues
  label: string
  hint: ComponentChildren
  props: BrandingPageProps
  type?: 'text' | 'url'
  placeholder?: string
  multiline?: boolean
}

function Field ({ name, label, hint, props, type = 'text', placeholder, multiline }: FieldProps) {
  const m = t(props.lang)
  const id = 'brand-' + name
  return (
    <div class="adm-field">
      <label for={id}>{label} <SourceBadge source={props.sources[name]} m={m}/></label>
      {multiline
        ? <textarea id={id} name={name} rows={2} maxLength={300} placeholder={placeholder} aria-describedby={id + '-hint'}>{props.values[name]}</textarea>
        : <input id={id} name={name} type={type} value={props.values[name]} placeholder={placeholder} maxLength={type === 'url' ? 500 : 80}
          autoComplete="off" spellcheck={false} aria-describedby={id + '-hint'}/>}
      <p class="adm-hint" id={id + '-hint'}>{hint}</p>
    </div>
  )
}

function ColorsSection ({ props }: { props: BrandingPageProps }) {
  const m = t(props.lang)
  const b = m.branding
  return (
    <section class="adm-help" id="farben" aria-labelledby="farben-title">
      <h2 id="farben-title">{b.colorsHeading}</h2>
      <p class="adm-note">{b.colorsIntro}</p>
      {props.colorNotice === 'saved' && <p class="adm-saved" role="status">{b.colorsSaved}</p>}
      {props.colorNotice === 'reset' && <p class="adm-saved" role="status">{b.colorsReset}</p>}
      {props.colorError && <div class="adm-alert" role="alert">{props.colorError}</div>}
      {props.contrastWarnings.map(warning => <p key={warning} class="adm-image-warn adm-color-warn">{warning}</p>)}
      <div class="adm-colors-layout">
        <form method="post" action="/branding/farben" class="adm-brand-form adm-colors" id="farben-form">
          <input type="hidden" name="csrf" value={props.csrf}/>
          {props.colors.map(color => {
            const id = 'farbe-' + color.key
            return (
              <div class="adm-color" key={color.key}>
                <input id={id} name={color.key} type="color" value={color.value} data-color={color.key} aria-describedby={id + '-hint'}/>
                <div class="adm-color-body">
                  <label for={id}>{color.label} <SourceBadge source={color.source} m={m}/></label>
                  <p class="adm-hint" id={id + '-hint'}>{color.hint}</p>
                  <p class="adm-color-meta">
                    <code class="adm-color-hex" data-hex-for={color.key}>{color.value}</code>
                    <button type="button" class="adm-mini" data-default-for={color.key} data-default={color.fallback}
                      title={b.colorDefaultTitle(color.fallback)} hidden>{b.colorDefault}</button>
                  </p>
                </div>
              </div>
            )
          })}
          <button type="submit" class="adm-btn adm-btn-primary" disabled={!props.persistent}>{b.saveColors}</button>
        </form>
        <figure class="adm-color-preview" id="farben-vorschau">
          <figcaption>{b.preview}</figcaption>
          <div class="adm-pv" aria-hidden="true">
            <div class="adm-pv-card">
              <p class="adm-pv-title">{b.previewTitle}</p>
              <p class="adm-pv-text">{b.previewText}</p>
              <span class="adm-pv-field">••••••••</span>
              <span class="adm-pv-button">{b.previewButton}</span>
              <span class="adm-pv-ghost">{b.previewGhost}</span>
              <p class="adm-pv-muted">{b.previewMuted}</p>
            </div>
          </div>
        </figure>
      </div>
      {props.hasAdminColors && (
        <form method="post" action="/branding/farben/zuruecksetzen" class="adm-reset">
          <input type="hidden" name="csrf" value={props.csrf}/>
          <button type="submit" class="adm-btn">{b.resetColors}</button>
          <span class="adm-hint">{b.resetColorsHint}</span>
        </form>
      )}
    </section>
  )
}

function ImageCard ({ image, props }: { image: ImageView, props: BrandingPageProps }) {
  const m = t(props.lang)
  const notice = props.imageNotice?.name === image.name ? props.imageNotice.kind : undefined
  const id = 'bild-' + image.name.replace(/\W+/g, '-')
  return (
    <li class="adm-image" id={id}>
      <div class={'adm-image-preview' + (image.light ? ' adm-image-light' : '')}>
        <img src={image.url} alt="" loading="lazy"/>
      </div>
      <div class="adm-image-body">
        <h3>{image.label} <SourceBadge source={image.source} m={m}/></h3>
        <p class="adm-hint">{image.usage}</p>
        <dl class="adm-image-meta">
          <dt>{m.branding.recommended}</dt><dd>{image.recommended}</dd>
          {image.current && <><dt>{m.branding.current}</dt><dd>{image.current}</dd></>}
        </dl>
        {image.ratioWarning && <p class="adm-image-warn">{m.branding.ratioWarning}</p>}
        <p class="adm-image-status" role="status" aria-live="polite">
          {notice === 'saved' && m.branding.imageSaved}
          {notice === 'reset' && m.branding.imageReset}
        </p>
        <div class="adm-actions">
          <label class="adm-btn adm-upload">
            <input type="file" accept={image.accept} data-slot={image.name} disabled={!props.persistent}/>
            {m.branding.upload}
          </label>
          {image.source === 'admin' && (
            <form method="post" action={`/branding/bild/${encodeURIComponent(image.name)}/zuruecksetzen`}>
              <input type="hidden" name="csrf" value={props.csrf}/>
              <button type="submit" class="adm-btn">{m.branding.resetImage}</button>
            </form>
          )}
        </div>
      </div>
    </li>
  )
}

export function BrandingPage (props: BrandingPageProps) {
  const m = t(props.lang)
  const b = m.branding
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={b.title + ' – ' + m.admin.title}/>
        <link rel="stylesheet" href={`${STATIC}/portal/admin.css`}/>
      </head>
      <body
        class="eg-page adm"
        data-csrf={props.csrf}
        data-uploading={b.uploading}
        data-too-large={b.tooLarge}
        data-upload-failed={b.uploadFailed}
        data-max-bytes={String(MAX_BRAND_FILE_BYTES)}
      >
        <AdminHeader
          lang={props.lang}
          active="branding"
          title={b.title}
          subtitle={props.baseUrl
            ? <a href={props.baseUrl} target="_blank" rel="noopener">{b.viewSite} ↗</a>
            : brandName(props.lang)}
        />

        <main class="adm-main">
          <p class="adm-note adm-intro">{b.intro}</p>
          {!props.persistent && <div class="adm-alert">{b.notWritable(<code>/app/data</code>)}</div>}

          <section class="adm-help" id="texte" aria-labelledby="texte-title">
            <h2 id="texte-title">{b.textsHeading}</h2>
            {props.notice === 'saved' && <p class="adm-saved" role="status">{b.saved}</p>}
            {props.notice === 'texts-reset' && <p class="adm-saved" role="status">{b.textsReset}</p>}
            {props.error && <div class="adm-alert" role="alert">{props.error}</div>}
            <form method="post" action="/branding/texte" class="adm-brand-form">
              <input type="hidden" name="csrf" value={props.csrf}/>
              <Field name="brandName" label={b.brandName} hint={b.brandNameHint} props={props} placeholder={m.defaultBrandName}/>
              <div class="adm-field-row">
                <Field name="websiteUrl" label={b.websiteUrl} hint={b.websiteUrlHint} props={props} type="url" placeholder="https://"/>
                <Field name="shareUrl" label={b.shareUrl} hint={b.shareUrlHint} props={props} type="url" placeholder="https://"/>
              </div>
              <div class="adm-field-row">
                <Field name="imprintUrl" label={b.imprintUrl} hint={b.imprintUrlHint} props={props} type="url" placeholder="https://"/>
                <Field name="privacyUrl" label={b.privacyUrl} hint={b.privacyUrlHint} props={props} type="url" placeholder="https://"/>
              </div>
              <div class="adm-field-row">
                <Field name="shareTextEn" label={b.shareTextEn} props={props} multiline placeholder={t('en').gallery.shareText}
                  hint={b.shareTextHint(<><code>{'{title}'}</code> <code>{'{number}'}</code> <code>{'{total}'}</code></>)}/>
                <Field name="shareTextDe" label={b.shareTextDe} props={props} multiline placeholder={t('de').gallery.shareText}
                  hint={b.shareTextHint(<><code>{'{titel}'}</code> <code>{'{nr}'}</code> <code>{'{anzahl}'}</code></>)}/>
              </div>
              <div class="adm-field-row">
                <Field name="newsletterTextEn" label={b.newsletterTextEn} hint={b.newsletterTextHint} props={props} multiline
                  placeholder={t('en').newsletter.text}/>
                <Field name="newsletterTextDe" label={b.newsletterTextDe} hint={b.newsletterTextHint} props={props} multiline
                  placeholder={t('de').newsletter.text}/>
              </div>
              <div class="adm-field-row">
                <Field name="phone" label={b.phone} hint={b.phoneHint} props={props} placeholder="+49 …"/>
                <Field name="instagramUrl" label={b.instagramUrl} hint={b.instagramUrlHint} props={props} type="url"
                  placeholder="https://instagram.com/…"/>
              </div>
              <button type="submit" class="adm-btn adm-btn-primary" disabled={!props.persistent}>{b.save}</button>
            </form>
            {props.hasAdminTexts && (
              <form method="post" action="/branding/texte/zuruecksetzen" class="adm-reset">
                <input type="hidden" name="csrf" value={props.csrf}/>
                <button type="submit" class="adm-btn">{b.resetTexts}</button>
                <span class="adm-hint">{b.resetTextsHint}</span>
              </form>
            )}
          </section>

          <ColorsSection props={props}/>

          <section class="adm-help" id="bilder" aria-labelledby="bilder-title">
            <h2 id="bilder-title">{b.imagesHeading}</h2>
            <p class="adm-note">{b.imagesIntro}</p>
            <ul class="adm-images">
              {props.images.map(image => <ImageCard key={image.name} image={image} props={props}/>)}
            </ul>
          </section>
        </main>
        <script src={`${STATIC}/portal/branding.js`}/>
      </body>
    </html>
  )
}
