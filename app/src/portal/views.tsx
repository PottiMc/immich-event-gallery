/*
 * Branded guest-facing pages: landing page with the password field, the
 * per-link password page, and the "not found" page. Plus small building
 * blocks (header / footer / language switcher) reused by the gallery.
 */

import { ComponentChildren } from 'preact'
import { ASSET_VERSION } from '../version'
import { brandUrl } from './branding'
import { Lang, LANGS, t } from './i18n'
import { brandName, imprintUrl, privacyUrl, sourceUrl, websiteUrl } from './settings'
import { themeColor, ThemeStyle } from './theme'

export const STATIC = `/share/static/${ASSET_VERSION}`

interface HeadProps {
  title: string
  lang: Lang
  description?: string
  ogImage?: string
  ogUrl?: string
}

/** Shared <head> content: fonts, icons, brand CSS, no indexing. */
export function BrandHead ({ title, lang, description, ogImage, ogUrl }: HeadProps) {
  return (
    <>
      <meta charSet="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="robots" content="noindex, nofollow"/>
      <meta name="theme-color" content={themeColor()}/>
      <title>{title}</title>
      {description && <meta name="description" content={description}/>}
      <meta property="og:title" content={title}/>
      <meta property="og:site_name" content={brandName(lang)}/>
      {description && <meta property="og:description" content={description}/>}
      {ogImage && <>
        <meta property="og:image" content={ogImage}/>
        <meta property="og:image:width" content="1200"/>
        <meta property="og:image:height" content="630"/>
        <meta name="twitter:card" content="summary_large_image"/>
      </>}
      {ogUrl && <meta property="og:url" content={ogUrl}/>}
      <link rel="icon" href={brandUrl('favicon.ico')} sizes="any"/>
      <link rel="icon" href={brandUrl('icon-192.png')} type="image/png"/>
      <link rel="apple-touch-icon" href={brandUrl('apple-touch-icon.png')}/>
      <link rel="stylesheet" href={`${STATIC}/portal/portal.css`}/>
      <ThemeStyle/>
    </>
  )
}

/**
 * Language switcher: plain links, so it works without JavaScript. The server
 * remembers the choice in a cookie and redirects back without `?lang=`.
 */
export function LangSwitch ({ lang, class: className, keep }: { lang: Lang, class?: string, keep?: string }) {
  return (
    <nav class={'eg-lang' + (className ? ' ' + className : '')} aria-label={t(lang).languageSwitch}>
      {LANGS.map(code => (
        <a
          key={code}
          href={'?' + (keep ? keep + '&' : '') + 'lang=' + code}
          hreflang={code}
          lang={code}
          title={t(code).languageName}
          aria-current={code === lang ? 'true' : undefined}
        >{code.toUpperCase()}</a>
      ))}
    </nav>
  )
}

export function BrandFooter ({ lang }: { lang: Lang }) {
  const m = t(lang)
  const links = [
    websiteUrl() && <a href={websiteUrl()} target="_blank" rel="noopener">{websiteUrl().replace(/^https?:\/\//, '')}</a>,
    imprintUrl() && <a href={imprintUrl()} target="_blank" rel="noopener">{m.imprint}</a>,
    privacyUrl() && <a href={privacyUrl()} target="_blank" rel="noopener">{m.privacy}</a>,
    // AGPL-3.0: every guest page must lead to the source code; the licence page links it
    <a href={m.licensePath}>{m.license}</a>
  ].filter(Boolean)
  return (
    <footer class="eg-footer">
      {links.map((link, i) => <>{i > 0 && <span aria-hidden="true">·</span>}{link}</>)}
    </footer>
  )
}

export function CenteredPage ({ children, script, lang }: { children: ComponentChildren, script?: string, lang: Lang }) {
  return (
    <body class="eg-page">
      <LangSwitch lang={lang} class="eg-lang-corner"/>
      <main class="eg-center">
        <a href="/" class="eg-logo-link" aria-label={brandName(lang) + ' – ' + t(lang).home}>
          <img class="eg-logo" src={brandUrl('logo-banner.png')} alt={brandName(lang)} width="366" height="142"/>
        </a>
        {children}
      </main>
      <BrandFooter lang={lang}/>
      {script && <script src={`${STATIC}/portal/${script}`}/>}
    </body>
  )
}

export type LandingError = 'wrong' | 'throttled' | 'qr-invalid' | 'unavailable' | 'expired'

export interface LandingProps {
  baseUrl: string
  lang: Lang
  error?: LandingError
  retryAfterSec?: number
  remaining?: number
}

function errorText (props: LandingProps): string | undefined {
  const m = t(props.lang)
  switch (props.error) {
    case 'wrong':
      return m.landing.wrong +
        (props.remaining !== undefined && props.remaining <= 2 && props.remaining > 0
          ? m.landing.attemptsLeft(props.remaining)
          : '')
    case 'throttled':
      return m.throttled(m.wait(props.retryAfterSec || 0))
    case 'qr-invalid':
      return m.landing.qrInvalid
    case 'expired':
      return m.landing.expired
    case 'unavailable':
      return m.landing.unavailable
  }
  return undefined
}

export function Landing (props: LandingProps) {
  const m = t(props.lang)
  const message = errorText(props)
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead
          lang={props.lang}
          title={m.landing.title + ' – ' + brandName(props.lang)}
          description={m.landing.description}
          ogImage={props.baseUrl + brandUrl('og-image.jpg')}
          ogUrl={props.baseUrl + '/'}
        />
      </head>
      <CenteredPage lang={props.lang}>
        <section class="eg-card">
          <h1>{m.landing.heading}</h1>
          <p class="eg-lead">
            {m.landing.lead1}<br/>
            {m.landing.lead2}
          </p>
          <form method="post" action="/" class="eg-form" autoComplete="off">
            <label for="passwort" class="eg-sr-only">{m.landing.passwordLabel}</label>
            <input
              id="passwort"
              name="passwort"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellcheck={false}
              placeholder={m.landing.placeholder}
              required
              autoFocus
              maxLength={200}
              aria-invalid={message ? 'true' : undefined}
              aria-describedby={message ? 'eg-error' : undefined}
              disabled={props.error === 'throttled'}
            />
            <button type="submit" class="eg-button" disabled={props.error === 'throttled'}>
              {m.landing.submit}
            </button>
          </form>
          {message && <p id="eg-error" class="eg-error" role="alert">{message}</p>}
          <p class="eg-hint">{m.landing.qrHint}</p>
        </section>
      </CenteredPage>
    </html>
  )
}

interface BrandedPasswordProps {
  shareKey: string
  notifyInvalidPassword: boolean
  lang: Lang
}

/**
 * Replacement for IPP's password page, shown when someone opens a
 * password-protected /share/<key> link directly without a session.
 */
export function BrandedPassword ({ shareKey, notifyInvalidPassword, lang }: BrandedPasswordProps) {
  const m = t(lang)
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={lang} title={m.unlock.title + ' – ' + brandName(lang)}/>
      </head>
      <CenteredPage lang={lang} script="unlock.js">
        <section class="eg-card">
          <h1>{m.unlock.heading}</h1>
          <p class="eg-lead">{m.unlock.lead}</p>
          <form id="unlock" method="post" class="eg-form" data-msg-failed={m.unlock.failed} data-msg-offline={m.unlock.offline}>
            <label for="password" class="eg-sr-only">{m.unlock.passwordLabel}</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={m.unlock.placeholder}
              required
              autoFocus
              aria-invalid={notifyInvalidPassword ? 'true' : undefined}
            />
            <input type="hidden" name="key" value={shareKey}/>
            <button type="submit" class="eg-button">{m.unlock.submit}</button>
          </form>
          <p id="unlock-error" class="eg-error" role="alert" hidden={!notifyInvalidPassword}>
            {notifyInvalidPassword && m.unlock.invalidAgain}
          </p>
        </section>
      </CenteredPage>
    </html>
  )
}

/** Licence notice with the link to the source code (AGPL-3.0, section 13). */
export function LicensePage ({ lang }: { lang: Lang }) {
  const m = t(lang)
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={lang} title={m.licensePage.title + ' – ' + brandName(lang)}/>
      </head>
      <CenteredPage lang={lang}>
        <section class="eg-card eg-prose">
          <h1>{m.licensePage.heading}</h1>
          <p>
            {m.licensePage.intro(
              <a href="https://github.com/alangrainger/immich-public-proxy" target="_blank" rel="noopener">Immich Public Proxy</a>,
              <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU Affero General Public License v3.0</a>
            )}
          </p>
          <p>
            {m.licensePage.source}<br/>
            <a href={sourceUrl()} target="_blank" rel="noopener">{sourceUrl().replace(/^https?:\/\//, '')}</a>
          </p>
          <h2>{m.licensePage.fonts}</h2>
          <ul>
            <li>
              Outfit – <a href={`${STATIC}/fonts/Outfit-LICENSE.txt`} target="_blank" rel="noopener">SIL Open Font License 1.1</a>
            </li>
            <li>
              Inter – <a href={`${STATIC}/fonts/Inter-LICENSE.txt`} target="_blank" rel="noopener">SIL Open Font License 1.1</a>
            </li>
          </ul>
          <p class="eg-hint">{m.licensePage.note}</p>
          <a class="eg-button eg-button-ghost eg-button-block" href="/">{m.toHome}</a>
        </section>
      </CenteredPage>
    </html>
  )
}

export function NotFound ({ lang }: { lang: Lang }) {
  const m = t(lang)
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={lang} title={m.notFound.title + ' – ' + brandName(lang)}/>
      </head>
      <CenteredPage lang={lang}>
        <section class="eg-card">
          <h1>{m.notFound.heading}</h1>
          <p class="eg-lead">{m.notFound.lead}</p>
          <a class="eg-button eg-button-block" href="/">{m.toHome}</a>
        </section>
      </CenteredPage>
    </html>
  )
}
