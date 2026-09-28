/*
 * Admin pages (separate port, behind reverse-proxy auth + Basic Auth):
 * overview of all shared links with passwords, QR codes and printable cards.
 */

import { BRAND } from './branding'
import { DownloadQuality } from './runtime-settings'
import { brandName } from './settings'
import { BrandHead, STATIC } from './views'

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
  links: AdminLinkView[]
  error?: string
  baseUrl: string
  baseUrlMissing: boolean
  suggestions: string[]
  settings: AdminSettingsView
}

function StatusBadges ({ link }: { link: AdminLinkView }) {
  return (
    <div class="adm-badges">
      {link.status === 'active' && <span class="adm-badge adm-ok">online</span>}
      {link.status === 'expired' && <span class="adm-badge adm-muted">abgelaufen</span>}
      {link.status === 'no-password' && <span class="adm-badge adm-warn">kein Passwort</span>}
      {link.duplicate && <span class="adm-badge adm-warn">Passwort doppelt</span>}
      {link.weak && link.status === 'active' && <span class="adm-badge adm-warn">Passwort schwach</span>}
      {link.neverExpires && link.status !== 'expired' && <span class="adm-badge adm-muted">läuft nie ab</span>}
    </div>
  )
}

function LinkCard ({ link }: { link: AdminLinkView }) {
  const usable = link.status !== 'expired'
  return (
    <article class={'adm-link' + (usable ? '' : ' adm-link-off')}>
      <div class="adm-qr" dangerouslySetInnerHTML={{ __html: usable ? link.qrSvg : '' }}/>
      <div class="adm-link-body">
        <h2>{link.title}</h2>
        <p class="adm-meta">
          {link.kind}{link.count !== undefined ? ` · ${link.count} ${link.count === 1 ? 'Element' : 'Elemente'}` : ''}
          {link.albumName && link.albumName !== link.title ? ` · Album „${link.albumName}“` : ''}
          {' · '}{link.expiresText}
        </p>
        <StatusBadges link={link}/>
        {link.password && (
          <p class="adm-password">
            Passwort: <code>{link.password}</code>
            <button type="button" class="adm-mini" data-copy={link.password}>kopieren</button>
          </p>
        )}
        {link.status === 'no-password' && (
          <p class="adm-note">
            Ohne Passwort ist dieses Album nicht über die Startseite erreichbar – nur über den Link bzw. QR-Code.
          </p>
        )}
        {link.duplicate && (
          <p class="adm-note">
            Ein anderes aktives Album hat (fast) dasselbe Passwort. Gäste landen dann im neuesten – bitte ändern.
          </p>
        )}
        {usable && (
          <div class="adm-actions">
            <button type="button" class="adm-btn" data-copy={link.accessUrl}>Direktlink kopieren</button>
            <a class="adm-btn" href={`/qr/${link.id}.png`} download>QR als PNG</a>
            <a class="adm-btn" href={`/qr/${link.id}.svg`} download>QR als SVG</a>
            <a class="adm-btn adm-btn-primary" href={`/karte/${link.id}`} target="_blank" rel="noopener">Karte drucken</a>
            <a class="adm-btn" href={link.accessUrl} target="_blank" rel="noopener">Galerie öffnen</a>
          </div>
        )}
      </div>
    </article>
  )
}

function SettingsSection ({ settings }: { settings: AdminSettingsView }) {
  const q = settings.downloadQuality
  return (
    <section class="adm-help adm-settings" id="einstellungen">
      <h2>Download für Gäste</h2>
      {settings.saved && <p class="adm-saved">Gespeichert ✓ – gilt ab sofort für alle Alben.</p>}
      {(settings.notPersisted || !settings.persistent) && (
        <div class="adm-alert">
          <strong>Einstellungen werden nicht dauerhaft gespeichert.</strong> Der Datenordner des Portals
          (<code>/app/data</code>) ist nicht beschreibbar. Die Auswahl gilt nur bis zum nächsten Neustart –
          siehe Abschnitt „Admin settings“ in <code>docs/configuration.md</code>.
        </div>
      )}
      <form method="post" action="/einstellungen" class="adm-form">
        <input type="hidden" name="csrf" value={settings.csrf}/>
        <label class="adm-choice">
          <input type="radio" name="downloadQuality" value="preview" checked={q === 'preview'}/>
          <span>
            <strong>Verkleinert</strong> – die Vorschau-Version aus Immich (Standard 1440 px an der langen Seite,
            meist unter 1 MB). Lädt schnell auch unterwegs und reicht für Handy, WhatsApp und Abzüge bis 10 × 15.
          </span>
        </label>
        <label class="adm-choice">
          <input type="radio" name="downloadQuality" value="original" checked={q === 'original'}/>
          <span>
            <strong>Original</strong> – die hochgeladene Datei in voller Auflösung (oft 3–15 MB pro Bild,
            iPhone-Fotos ggf. als HEIC).
          </span>
        </label>
        <button type="submit" class="adm-btn adm-btn-primary">Speichern</button>
      </form>
      <p class="adm-note">
        Gilt für den Download einzelner Bilder und für „Alle herunterladen“ (ZIP). In der Galerie sehen Gäste immer die
        Vorschau-Version. Videos werden stets im Original geladen. Ob Gäste überhaupt herunterladen dürfen, legst du pro
        Album in Immich fest (<em>Download erlauben</em>).
      </p>
      <p class="adm-note">
        Größe und Qualität der verkleinerten Version stellst du in Immich ein: <em>Administration → Einstellungen →
        Bildeinstellungen → Vorschau</em> (z.B. 2160 px, Qualität 85). Danach unter <em>Aufträge</em> die
        Miniaturansichten für <em>alle</em> Bilder neu erzeugen lassen.
      </p>
    </section>
  )
}

export function AdminPage (props: AdminPageProps) {
  const active = props.links.filter(l => l.status === 'active').length
  return (
    <html lang="de">
      <head>
        <BrandHead title={'Bilder-Admin – ' + brandName()}/>
        <link rel="stylesheet" href={`${STATIC}/portal/admin.css`}/>
      </head>
      <body class="eg-page adm">
        <header class="adm-header">
          <img src={`${BRAND}/logo-banner.png`} alt={brandName()} height="56"/>
          <div>
            <h1>Bilder-Admin</h1>
            <p>{active} {active === 1 ? 'Album' : 'Alben'} über <a href={props.baseUrl} target="_blank" rel="noopener">{props.baseUrl.replace(/^https?:\/\//, '')}</a> erreichbar</p>
          </div>
        </header>

        <main class="adm-main">
          {props.baseUrlMissing && (
            <div class="adm-alert">
              <strong>PUBLIC_BASE_URL fehlt.</strong> Setze im Stack z.B. <code>PUBLIC_BASE_URL=https://bilder.example.com</code>,
              sonst zeigen QR-Codes auf die falsche Adresse.
            </div>
          )}
          {props.error && (
            <div class="adm-alert">
              <strong>Keine Verbindung zu Immich:</strong> {props.error}
            </div>
          )}

          {props.links.length === 0 && !props.error && (
            <div class="adm-empty">
              <h2>Noch keine Freigaben</h2>
              <p>Lege in Immich eine Freigabe mit Passwort an (siehe unten) – sie erscheint dann automatisch hier.</p>
            </div>
          )}

          {props.links.map(link => <LinkCard key={link.id} link={link}/>)}

          <SettingsSection settings={props.settings}/>

          <section class="adm-help">
            <h2>Neues Album online stellen</h2>
            <ol>
              <li>In Immich ein Album anlegen und die Bilder hochladen. Der Albumname ist der Titel, den Gäste sehen.</li>
              <li>Im Album auf <em>Teilen → Link erstellen</em>. Dort ein <strong>Passwort</strong> setzen,
                ein <strong>Ablaufdatum</strong> wählen (z.B. 60 Tage) und <em>Download erlauben</em> nach Wunsch.</li>
              <li>Fertig – diese Seite neu laden, QR-Code oder Karte drucken bzw. das Passwort an die Gäste schicken.</li>
            </ol>
            <p class="adm-note">
              Eigener WhatsApp-Text für ein Album? In Immich in die Albumbeschreibung eine Zeile
              <code>Teilen: Das war die Weinwanderung an der Saar mit {brandName()} 🍷 – Bild {'{nr}'} von {'{anzahl}'}</code> schreiben.
            </p>
            <h3>Passwort-Vorschläge</h3>
            <ul class="adm-suggestions">
              {props.suggestions.map(s => (
                <li key={s}><code>{s}</code> <button type="button" class="adm-mini" data-copy={s}>kopieren</button></li>
              ))}
            </ul>
            <p><a href="/">Neue Vorschläge</a></p>
          </section>
        </main>
        <script src={`${STATIC}/portal/admin.js`}/>
      </body>
    </html>
  )
}

export interface CardProps {
  title: string
  password: string | null
  hostLabel: string
  qrSvg: string
  dark: boolean
}

/** Printable A6 card for guests: QR code plus password as a fallback. */
export function PrintCard (props: CardProps) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex, nofollow"/>
        <title>{'Karte – ' + props.title}</title>
        <link rel="stylesheet" href={`${STATIC}/portal/card.css`}/>
      </head>
      <body class={props.dark ? 'card-dark' : ''}>
        <div class="card-tools">
          <button type="button" id="card-print">Drucken</button>
          <a href={props.dark ? '?' : '?dunkel'}>{props.dark ? 'Helle Variante' : 'Dunkle Variante'}</a>
          <span>Format A6 (105 × 148 mm). Für 4 Karten pro Blatt im Druckdialog „4 Seiten pro Blatt“ auf A4 wählen.</span>
        </div>
        <section class="card">
          <img class="card-logo" src={`${BRAND}/${props.dark ? 'logo-banner.png' : 'logo-light.png'}`} alt={brandName()}/>
          <p class="card-kicker">Deine Bilder von</p>
          <h1 class="card-title">{props.title}</h1>
          <div class="card-qr" dangerouslySetInnerHTML={{ __html: props.qrSvg }}/>
          <p class="card-scan">Mit der Handykamera scannen</p>
          {props.password && (
            <p class="card-alt">
              oder auf <strong>{props.hostLabel}</strong><br/>
              mit dem Passwort <strong class="card-password">{props.password}</strong>
            </p>
          )}
          <p class="card-thanks">Schön, dass du dabei warst! 🍷</p>
        </section>
        <script src={`${STATIC}/portal/card.js`}/>
      </body>
    </html>
  )
}
