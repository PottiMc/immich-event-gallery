/*
 * Admin pages (separate port, behind reverse-proxy auth + the admin login):
 * login form, overview of all shared links with passwords, QR codes and
 * printable cards.
 */

import { adminFormToken } from './admin-forms'
import { brandUrl } from './branding'
import { CardOptions } from './card'
import { ComponentChildren } from 'preact'
import { Lang, Messages, t } from './i18n'
import { DownloadQuality } from './runtime-settings'
import { brandName } from './settings'
import { BrandHead, LangSwitch, STATIC } from './views'

export interface AdminLinkView {
  id: string
  title: string
  albumName?: string
  kind: string
  count?: number
  createdAt: string
  expiresText: string
  password: string | null
  accessUrl: string
  galleryUrl: string
  qrSvg: string
  status: 'active' | 'no-password' | 'expired'
  weak: boolean
  duplicate: boolean
  neverExpires: boolean
}

export interface AdminSettingsView {
  downloadQuality: DownloadQuality
  /** settings.json can be written, so changes survive a restart */
  persistent: boolean
  saved: boolean
  notPersisted: boolean
  csrf: string
}

export interface AdminPageProps {
  lang: Lang
  links: AdminLinkView[]
  error?: string
  baseUrl: string
  baseUrlMissing: boolean
  suggestions: string[]
  /** Unfold the help section (after "New suggestions") */
  helpOpen: boolean
  settings: AdminSettingsView
}

function countText (link: AdminLinkView, m: Messages): string {
  if (link.count === undefined) return link.kind
  return m.admin.items(link.count)
}

/** Warnings only; the status itself is the coloured dot. */
function Badges ({ link, m }: { link: AdminLinkView, m: Messages }) {
  const live = link.status !== 'expired'
  return (
    <>
      {link.duplicate && live && (
        <span class="adm-badge adm-warn" title={m.admin.duplicateTitle}>{m.admin.duplicate}</span>
      )}
      {link.weak && link.status === 'active' && <span class="adm-badge adm-warn">{m.admin.weak}</span>}
      {link.neverExpires && live && <span class="adm-badge adm-muted">{m.admin.neverExpires}</span>}
    </>
  )
}

function statusLabel (status: AdminLinkView['status'], m: Messages): string {
  if (status === 'active') return m.admin.statusActive
  if (status === 'no-password') return m.admin.statusNoPassword
  return m.admin.statusExpired
}

/** One compact row per share; QR code and the rarer actions fold out. */
function LinkRow ({ link, m }: { link: AdminLinkView, m: Messages }) {
  const usable = link.status !== 'expired'
  const panelId = 'details-' + link.id
  const label = statusLabel(link.status, m)
  return (
    <li class={'adm-row adm-row-' + link.status}>
      <span class="adm-dot" title={label} aria-label={label}/>
      <div class="adm-row-title">
        <h2>{link.title}</h2>
        <p class="adm-meta">
          {countText(link, m)}
          {link.albumName && link.albumName !== link.title ? m.admin.albumName(link.albumName) : ''}
          {' · '}{link.expiresText}
          {' '}<Badges link={link} m={m}/>
        </p>
      </div>
      <div class="adm-row-pass">
        {link.password
          ? <><code>{link.password}</code><button type="button" class="adm-mini" data-copy={link.password} title={m.admin.copyPasswordTitle}>{m.admin.copy}</button></>
          : <span class="adm-badge adm-warn">{m.admin.noPassword}</span>}
      </div>
      {usable && (
        <div class="adm-row-actions">
          <button type="button" class="adm-btn" data-copy={link.accessUrl} title={m.admin.copyLinkTitle}>{m.admin.copyLink}</button>
          <a class="adm-btn adm-btn-primary" href={`/karte/${link.id}`} target="_blank" rel="noopener">{m.admin.card}</a>
          <button type="button" class="adm-toggle" aria-expanded="false" aria-controls={panelId} title={m.admin.moreTitle}>
            <span aria-hidden="true">▾</span><span class="eg-sr-only">{m.admin.details}</span>
          </button>
        </div>
      )}
      {usable && (
        <div class="adm-row-panel" id={panelId} hidden>
          <div class="adm-qr" dangerouslySetInnerHTML={{ __html: link.qrSvg }}/>
          <div class="adm-panel-body">
            {link.status === 'no-password' && <p class="adm-note">{m.admin.noteNoPassword}</p>}
            {link.duplicate && <p class="adm-note">{m.admin.noteDuplicate}</p>}
            <div class="adm-actions">
              <a class="adm-btn" href={`/qr/${link.id}.png`} download>{m.admin.qrPng}</a>
              <a class="adm-btn" href={`/qr/${link.id}.svg`} download>{m.admin.qrSvg}</a>
              <a class="adm-btn" href={`/karte/${link.id}?dunkel`} target="_blank" rel="noopener">{m.admin.cardDark}</a>
              <a class="adm-btn" href={link.accessUrl} target="_blank" rel="noopener">{m.admin.openGallery}</a>
              <a class="adm-btn" href={`/statistik?freigabe=${encodeURIComponent(link.id)}`}>{m.admin.statsLink}</a>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function SettingsSection ({ settings, m }: { settings: AdminSettingsView, m: Messages }) {
  const q = settings.downloadQuality
  return (
    <details class="adm-help adm-fold adm-settings" id="einstellungen" open={settings.saved || settings.notPersisted || !settings.persistent}>
      <summary>
        <h2>{m.admin.settingsHeading}</h2>
        <span class="adm-summary-value">{q === 'preview' ? m.admin.valuePreview : m.admin.valueOriginal}</span>
      </summary>
      {settings.saved && <p class="adm-saved">{m.admin.saved}</p>}
      {(settings.notPersisted || !settings.persistent) && (
        <div class="adm-alert">
          {m.admin.notPersisted(<code>/app/data</code>, <code>docs/configuration.md</code>)}
        </div>
      )}
      <form method="post" action="/einstellungen" class="adm-form">
        <input type="hidden" name="csrf" value={settings.csrf}/>
        <label class="adm-choice">
          <input type="radio" name="downloadQuality" value="preview" checked={q === 'preview'}/>
          <span>{m.admin.choicePreview()}</span>
        </label>
        <label class="adm-choice">
          <input type="radio" name="downloadQuality" value="original" checked={q === 'original'}/>
          <span>{m.admin.choiceOriginal()}</span>
        </label>
        <button type="submit" class="adm-btn adm-btn-primary">{m.admin.save}</button>
      </form>
      <p class="adm-note">{m.admin.settingsNote1()}</p>
      <p class="adm-note">{m.admin.settingsNote2()}</p>
    </details>
  )
}

interface AdminHeaderProps {
  lang: Lang
  active: 'shares' | 'stats' | 'branding'
  title: string
  subtitle: ComponentChildren
}

/** Header of every admin page: logo, title, language switcher and the page tabs. */
export function AdminHeader ({ lang, active, title, subtitle }: AdminHeaderProps) {
  const m = t(lang)
  return (
    <>
      <header class="adm-header">
        <img src={brandUrl('logo-banner.png')} alt={brandName(lang)} height="56"/>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <LangSwitch lang={lang} class="adm-lang"/>
      </header>
      <nav class="adm-tabs" aria-label={m.admin.title}>
        <a href="/" aria-current={active === 'shares' ? 'page' : undefined}>{m.admin.tabShares}</a>
        <a href="/statistik" aria-current={active === 'stats' ? 'page' : undefined}>{m.admin.tabStats}</a>
        <a href="/branding" aria-current={active === 'branding' ? 'page' : undefined}>{m.admin.tabBranding}</a>
        <form method="post" action="/abmelden" class="adm-logout">
          <input type="hidden" name="csrf" value={adminFormToken()}/>
          <button type="submit">{m.admin.logout}</button>
        </form>
      </nav>
    </>
  )
}

export function AdminPage (props: AdminPageProps) {
  const m = t(props.lang)
  const brand = brandName(props.lang)
  const active = props.links.filter(l => l.status === 'active').length
  const current = props.links.filter(l => l.status !== 'expired')
  const expired = props.links.filter(l => l.status === 'expired')
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={m.admin.title + ' – ' + brand}/>
        <link rel="stylesheet" href={`${STATIC}/portal/admin.css`}/>
      </head>
      <body class="eg-page adm" data-copied={m.admin.copied} data-copy-prompt={m.admin.copyPrompt}>
        <AdminHeader
          lang={props.lang}
          active="shares"
          title={m.admin.title}
          subtitle={m.admin.reachable(active, <a href={props.baseUrl} target="_blank" rel="noopener">{props.baseUrl.replace(/^https?:\/\//, '')}</a>)}
        />

        <main class="adm-main">
          {props.baseUrlMissing && (
            <div class="adm-alert">
              {m.admin.baseUrlMissing(<code>PUBLIC_BASE_URL=https://bilder.example.com</code>)}
            </div>
          )}
          {props.error && (
            <div class="adm-alert">
              <strong>{m.admin.immichError}</strong> {props.error}
            </div>
          )}

          {props.links.length === 0 && !props.error && (
            <div class="adm-empty">
              <h2>{m.admin.emptyHeading}</h2>
              <p>{m.admin.emptyText}</p>
            </div>
          )}

          {current.length > 0 && (
            <ul class="adm-list">
              {current.map(link => <LinkRow key={link.id} link={link} m={m}/>)}
            </ul>
          )}

          {expired.length > 0 && (
            <details class="adm-fold adm-expired">
              <summary><h2>{m.admin.expiredHeading}</h2><span class="adm-summary-value">{expired.length}</span></summary>
              <ul class="adm-list">
                {expired.map(link => <LinkRow key={link.id} link={link} m={m}/>)}
              </ul>
              <p class="adm-note">{m.admin.expiredNote}</p>
            </details>
          )}

          <SettingsSection settings={props.settings} m={m}/>

          <details class="adm-help adm-fold" id="hilfe" open={props.helpOpen || (props.links.length === 0 && !props.error)}>
            <summary><h2>{m.admin.helpHeading}</h2><span class="adm-summary-value adm-summary-hint">{m.admin.helpHint}</span></summary>
            <ol>
              {m.admin.helpSteps().map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            <p class="adm-note">
              {m.admin.shareTextNote(<code>{m.admin.shareTextExample(brand)}</code>)}
            </p>
            <h3>{m.admin.suggestionsHeading}</h3>
            <ul class="adm-suggestions">
              {props.suggestions.map(s => (
                <li key={s}><code>{s}</code> <button type="button" class="adm-mini" data-copy={s}>{m.admin.copy}</button></li>
              ))}
            </ul>
            <p><a href="/?vorschlaege#hilfe">{m.admin.newSuggestions}</a></p>
          </details>
        </main>
        <script src={`${STATIC}/portal/admin.js`}/>
      </body>
    </html>
  )
}

export interface AdminLoginProps {
  lang: Lang
  /** Where to go after signing in */
  next: string
  error?: 'wrong' | 'throttled'
  retryAfterSec?: number
  remaining?: number
}

function loginError (props: AdminLoginProps, m: Messages): string | undefined {
  if (props.error === 'throttled') return m.admin.tooManyFailures(m.wait(props.retryAfterSec || 0))
  if (props.error !== 'wrong') return undefined
  const left = props.remaining
  return m.admin.loginWrong + (left !== undefined && left > 0 && left <= 2 ? m.landing.attemptsLeft(left) : '')
}

/**
 * Login form in the look of the guest landing page. A real form with
 * username and current-password fields, so password managers offer to save
 * and fill it in.
 */
export function AdminLogin (props: AdminLoginProps) {
  const m = t(props.lang)
  const message = loginError(props, m)
  const throttled = props.error === 'throttled'
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={m.admin.loginTitle + ' – ' + m.admin.title}/>
      </head>
      <body class="eg-page">
        <LangSwitch lang={props.lang} class="eg-lang-corner"/>
        <main class="eg-center">
          <img class="eg-logo eg-logo-login" src={brandUrl('logo-banner.png')} alt={brandName(props.lang)} width="366" height="142"/>
          <section class="eg-card">
            <h1>{m.admin.title}</h1>
            <p class="eg-lead">{m.admin.loginLead}</p>
            <form method="post" action="/anmelden" class="eg-form">
              <input type="hidden" name="weiter" value={props.next}/>
              {/* Password managers file the entry under this name; the server ignores it */}
              <input type="text" name="username" value="admin" autoComplete="username" hidden/>
              <label for="admin-password" class="eg-sr-only">{m.admin.loginPasswordLabel}</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={m.admin.loginPlaceholder}
                required
                autoFocus
                maxLength={200}
                aria-invalid={message ? 'true' : undefined}
                aria-describedby={message ? 'admin-login-error' : undefined}
                disabled={throttled}
              />
              <button type="submit" class="eg-button" disabled={throttled}>{m.admin.loginSubmit}</button>
            </form>
            {message && <p id="admin-login-error" class="eg-error" role="alert">{message}</p>}
          </section>
        </main>
      </body>
    </html>
  )
}

export interface CardProps {
  lang: Lang
  options: CardOptions
  /** Share title without the date, shown when the title field is empty */
  defaultTitle: string
  /** Current query without `lang`, kept by the language switch */
  query: string
  password: string | null
  hostLabel: string
  qrSvg: string
}

const ICONS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z"/></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></>,
  glass: <><path d="M7 3h10v4.5a5 5 0 0 1-10 0z"/><path d="M12 12.5V21M8 21h8"/></>
}

function Icon ({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg class="card-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>
  )
}

function Card ({ props }: { props: CardProps }) {
  const m = t(props.lang)
  const { options } = props
  return (
    <section class="card">
      <img class="card-logo" src={brandUrl(options.dark ? 'logo-banner.png' : 'logo-light.png')} alt={brandName(props.lang)}/>
      <p class="card-kicker">{m.card.kicker}</p>
      <h1 class="card-title" data-card="title">{options.title}</h1>
      <p class="card-date" hidden={!options.date}><Icon name="calendar"/><span data-card="date">{options.date}</span></p>
      <div class="card-qr" dangerouslySetInnerHTML={{ __html: props.qrSvg }}/>
      <p class="card-scan"><Icon name="camera"/>{m.card.scan}</p>
      {props.password && (
        <div class="card-alt">
          <p><Icon name="globe"/>{m.card.altSite(<strong>{props.hostLabel}</strong>)}</p>
          <p><Icon name="lock"/>{m.card.altPassword(<strong class="card-password">{props.password}</strong>)}</p>
        </div>
      )}
      <p class="card-thanks">{m.card.thanks}<Icon name="glass"/></p>
    </section>
  )
}

/** Crop marks around the 2 × 2 grid: three cut lines per direction. */
function CropMarks () {
  return (
    <>
      {[0, 1, 2].map(i => <>
        <i class="mark mark-top" style={`--i: ${i}`}/>
        <i class="mark mark-bottom" style={`--i: ${i}`}/>
        <i class="mark mark-left" style={`--i: ${i}`}/>
        <i class="mark mark-right" style={`--i: ${i}`}/>
      </>)}
    </>
  )
}

/**
 * Printable guest card: QR code plus password as a fallback. By default four
 * cards on an A4 sheet with crop marks, optionally a single A6 card.
 */
export function PrintCard (props: CardProps) {
  const m = t(props.lang)
  const { options } = props
  const sheet = options.layout === 'sheet'
  return (
    <html lang={m.htmlLang}>
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex, nofollow"/>
        <title>{m.card.title + ' – ' + options.title}</title>
        <link rel="stylesheet" href={`${STATIC}/portal/card.css`}/>
        {!sheet && <style>{'@page { size: 105mm 148mm; margin: 0; }'}</style>}
      </head>
      <body class={(options.dark ? 'card-dark ' : '') + (sheet ? 'card-sheet' : 'card-single')}>
        <form class="card-tools" id="card-form" method="get" data-page-title={m.card.title}>
          <label class="card-field card-field-wide">
            <span>{m.card.titleLabel}</span>
            <input name="titel" value={options.title} placeholder={props.defaultTitle} maxLength={120} autoComplete="off"/>
          </label>
          <label class="card-field">
            <span>{m.card.dateLabel}</span>
            <input name="datum" value={options.date} placeholder={m.card.datePlaceholder} maxLength={120} autoComplete="off"/>
          </label>
          <label class="card-field">
            <span>{m.card.layoutLabel}</span>
            <select name="format">
              <option value="a4" selected={sheet}>{m.card.layoutSheet}</option>
              <option value="a6" selected={!sheet}>{m.card.layoutSingle}</option>
            </select>
          </label>
          <label class="card-check">
            <input type="checkbox" name="dunkel" value="" checked={options.dark}/>
            {m.card.dark}
          </label>
          <button type="button" id="card-print">{m.card.print}</button>
          <LangSwitch lang={props.lang} class="card-lang" keep={props.query || undefined}/>
          <p class="card-hint">{sheet ? m.card.hintSheet : m.card.hintSingle}</p>
        </form>
        {sheet
          ? (
            <main class="sheet">
              <div class="sheet-bleed"/>
              {[0, 1, 2, 3].map(i => (
                <div key={i} class="sheet-cell" style={`--c: ${i % 2}; --r: ${Math.floor(i / 2)}`}>
                  <Card props={props}/>
                </div>
              ))}
              <CropMarks/>
            </main>
            )
          : <Card props={props}/>}
        <script src={`${STATIC}/portal/card.js`}/>
      </body>
    </html>
  )
}
