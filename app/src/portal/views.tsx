/*
 * Branded guest-facing pages: landing page with the password field, the
 * per-link password page, and the "not found" page. Plus small building
 * blocks (header / footer / share dialog) reused by the gallery.
 */

import { ComponentChildren } from 'preact'
import { ASSET_VERSION } from '../version'
import { BRAND } from './branding'
import { brandName, imprintUrl, privacyUrl, sourceUrl, websiteUrl } from './settings'

export const STATIC = `/share/static/${ASSET_VERSION}`

interface HeadProps {
  title: string
  description?: string
  ogImage?: string
  ogUrl?: string
}

/** Shared <head> content: fonts, icons, brand CSS, no indexing. */
export function BrandHead ({ title, description, ogImage, ogUrl }: HeadProps) {
  return (
    <>
      <meta charSet="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="robots" content="noindex, nofollow"/>
      <meta name="theme-color" content="#0d0b0a"/>
      <title>{title}</title>
      {description && <meta name="description" content={description}/>}
      <meta property="og:title" content={title}/>
      <meta property="og:site_name" content={brandName()}/>
      {description && <meta property="og:description" content={description}/>}
      {ogImage && <>
        <meta property="og:image" content={ogImage}/>
        <meta property="og:image:width" content="1200"/>
        <meta property="og:image:height" content="630"/>
        <meta name="twitter:card" content="summary_large_image"/>
      </>}
      {ogUrl && <meta property="og:url" content={ogUrl}/>}
      <link rel="icon" href="/favicon.ico" sizes="any"/>
      <link rel="icon" href={`${BRAND}/icon-192.png`} type="image/png"/>
      <link rel="apple-touch-icon" href={`${BRAND}/apple-touch-icon.png`}/>
      <link rel="stylesheet" href={`${STATIC}/portal/portal.css`}/>
    </>
  )
}

export function BrandFooter () {
  const links = [
    websiteUrl() && <a href={websiteUrl()} target="_blank" rel="noopener">{websiteUrl().replace(/^https?:\/\//, '')}</a>,
    imprintUrl() && <a href={imprintUrl()} target="_blank" rel="noopener">Impressum</a>,
    privacyUrl() && <a href={privacyUrl()} target="_blank" rel="noopener">Datenschutz</a>,
    // AGPL-3.0: every guest page must lead to the source code; /lizenz links it
    <a href="/lizenz">Lizenz</a>
  ].filter(Boolean)
  return (
    <footer class="eg-footer">
      {links.map((link, i) => <>{i > 0 && <span aria-hidden="true">·</span>}{link}</>)}
    </footer>
  )
}

function CenteredPage ({ children, script }: { children: ComponentChildren, script?: string }) {
  return (
    <body class="eg-page">
      <main class="eg-center">
        <a href="/" class="eg-logo-link" aria-label={brandName() + ' – Startseite'}>
          <img class="eg-logo" src={`${BRAND}/logo-banner.png`} alt={brandName()} width="366" height="142"/>
        </a>
        {children}
      </main>
      <BrandFooter/>
      {script && <script src={`${STATIC}/portal/${script}`}/>}
    </body>
  )
}

export type LandingError = 'wrong' | 'throttled' | 'qr-invalid' | 'unavailable' | 'expired'

export interface LandingProps {
  baseUrl: string
  error?: LandingError
  retryText?: string
  remaining?: number
}

function errorText (props: LandingProps): string | undefined {
  switch (props.error) {
    case 'wrong':
      return 'Zu diesem Passwort wurde kein Album gefunden. Schau nochmal genau hin – ' +
        'Groß- und Kleinschreibung, Leerzeichen und Bindestriche sind übrigens egal.' +
        (props.remaining !== undefined && props.remaining <= 2 && props.remaining > 0
          ? ` (Noch ${props.remaining} ${props.remaining === 1 ? 'Versuch' : 'Versuche'}, dann gibt's eine kurze Pause.)`
          : '')
    case 'throttled':
      return `Das waren ein paar Versuche zu viel. Bitte probier es in ${props.retryText || 'ein paar Minuten'} noch einmal.`
    case 'qr-invalid':
      return 'Dieser QR-Code bzw. Link ist nicht mehr gültig – vielleicht ist das Album schon offline. ' +
        'Wenn du das Passwort hast, kannst du es hier eingeben.'
    case 'expired':
      return 'Dieses Album ist leider nicht mehr online. Falls du noch Bilder brauchst, wende dich gerne an den Veranstalter.'
    case 'unavailable':
      return 'Die Bilder sind gerade nicht erreichbar. Bitte versuch es in ein paar Minuten noch einmal.'
  }
  return undefined
}

export function Landing (props: LandingProps) {
  const message = errorText(props)
  return (
    <html lang="de">
      <head>
        <BrandHead
          title={'Deine Event-Bilder – ' + brandName()}
          description="Schön, dass du dabei warst! Hier findest du die Bilder von deinem Event."
          ogImage={props.baseUrl + `${BRAND}/og-image.jpg`}
          ogUrl={props.baseUrl + '/'}
        />
      </head>
      <CenteredPage>
        <section class="eg-card">
          <h1>Deine Bilder vom Event</h1>
          <p class="eg-lead">
            Schön, dass du dabei warst! 🍷<br/>
            Gib hier das Passwort ein, das du bekommen hast – dann geht's direkt zu deinen Bildern.
          </p>
          <form method="post" action="/" class="eg-form" autoComplete="off">
            <label for="passwort" class="eg-sr-only">Passwort</label>
            <input
              id="passwort"
              name="passwort"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellcheck={false}
              placeholder="Passwort, z.B. riesling-karaffe-4827"
              required
              autoFocus
              maxLength={200}
              aria-invalid={message ? 'true' : undefined}
              aria-describedby={message ? 'eg-error' : undefined}
              disabled={props.error === 'throttled'}
            />
            <button type="submit" class="eg-button" disabled={props.error === 'throttled'}>
              Bilder ansehen
            </button>
          </form>
          {message && <p id="eg-error" class="eg-error" role="alert">{message}</p>}
          <p class="eg-hint">
            Du hast einen QR-Code bekommen? Einfach mit der Handykamera scannen – dann brauchst du kein Passwort.
          </p>
        </section>
      </CenteredPage>
    </html>
  )
}

interface BrandedPasswordProps {
  shareKey: string
  notifyInvalidPassword: boolean
}

/**
 * Replacement for IPP's password page, shown when someone opens a
 * password-protected /share/<key> link directly without a session.
 */
export function BrandedPassword ({ shareKey, notifyInvalidPassword }: BrandedPasswordProps) {
  return (
    <html lang="de">
      <head>
        <BrandHead title={'Passwort benötigt – ' + brandName()}/>
      </head>
      <CenteredPage script="unlock.js">
        <section class="eg-card">
          <h1>Fast geschafft!</h1>
          <p class="eg-lead">Dieses Album ist mit einem Passwort geschützt. Gib es hier ein, um die Bilder zu sehen.</p>
          <form id="unlock" method="post" class="eg-form">
            <label for="password" class="eg-sr-only">Passwort</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="Passwort"
              required
              autoFocus
              aria-invalid={notifyInvalidPassword ? 'true' : undefined}
            />
            <input type="hidden" name="key" value={shareKey}/>
            <button type="submit" class="eg-button">Entsperren</button>
          </form>
          <p id="unlock-error" class="eg-error" role="alert" hidden={!notifyInvalidPassword}>
            {notifyInvalidPassword && 'Das Passwort stimmt leider nicht mehr. Bitte gib es noch einmal ein.'}
          </p>
        </section>
      </CenteredPage>
    </html>
  )
}

/** Licence notice with the link to the source code (AGPL-3.0, section 13). */
export function LicensePage () {
  return (
    <html lang="de">
      <head>
        <BrandHead title={'Lizenz – ' + brandName()}/>
      </head>
      <CenteredPage>
        <section class="eg-card eg-prose">
          <h1>Lizenz &amp; Quellcode</h1>
          <p>
            Dieses Bilder-Portal ist freie Software. Es basiert auf{' '}
            <a href="https://github.com/alangrainger/immich-public-proxy" target="_blank" rel="noopener">Immich Public Proxy</a>{' '}
            von Alan Grainger und steht wie das Original unter der{' '}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU Affero General Public License v3.0</a>.
          </p>
          <p>
            Den vollständigen Quellcode dieser Version findest du hier:<br/>
            <a href={sourceUrl()} target="_blank" rel="noopener">{sourceUrl().replace(/^https?:\/\//, '')}</a>
          </p>
          <h2>Verwendete Schriften</h2>
          <ul>
            <li>
              Outfit – <a href={`${STATIC}/fonts/Outfit-LICENSE.txt`} target="_blank" rel="noopener">SIL Open Font License 1.1</a>
            </li>
            <li>
              Inter – <a href={`${STATIC}/fonts/Inter-LICENSE.txt`} target="_blank" rel="noopener">SIL Open Font License 1.1</a>
            </li>
          </ul>
          <p class="eg-hint">
            Diese Lizenz gilt für die Software, nicht für die Bilder in den Alben.
          </p>
          <a class="eg-button eg-button-ghost eg-button-block" href="/">Zur Startseite</a>
        </section>
      </CenteredPage>
    </html>
  )
}

export function NotFound () {
  return (
    <html lang="de">
      <head>
        <BrandHead title={'Nicht gefunden – ' + brandName()}/>
      </head>
      <CenteredPage>
        <section class="eg-card">
          <h1>Hier ist nichts (mehr)</h1>
          <p class="eg-lead">
            Diese Seite gibt es nicht – oder das Album ist nicht mehr online.
          </p>
          <a class="eg-button eg-button-block" href="/">Zur Startseite</a>
        </section>
      </CenteredPage>
    </html>
  )
}
