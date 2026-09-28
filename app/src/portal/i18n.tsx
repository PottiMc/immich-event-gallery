/*
 * Server-rendered texts of the guest pages, the gallery and the admin page,
 * and the choice of language per visitor.
 *
 * English is the primary language. The language comes from, in this order:
 * the language switcher (`?lang=de`, remembered in a cookie), the browser's
 * Accept-Language header, and `portal.defaultLanguage` in config.json.
 */

import { ComponentChildren } from 'preact'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { getConfigOption } from '../config/access'
import { isLang, Lang, LANGS } from '../shared/i18n'

export type { Lang }
export { LANGS }

export const LANG_COOKIE = 'lang'

const en = {
  htmlLang: 'en',
  dateFormat: 'D MMM YYYY',
  languageName: 'English',
  languageSwitch: 'Language',
  defaultBrandName: 'Photo Portal',
  home: 'Home',
  imprint: 'Legal notice',
  privacy: 'Privacy',
  license: 'License',
  licensePath: '/license',
  toHome: 'Back to home',

  wait: (seconds: number) => {
    if (seconds < 90) return 'a minute'
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 90) return minutes + ' minutes'
    return Math.ceil(minutes / 60) + ' hours'
  },
  throttled: (wait: string) => `That was a few too many attempts. Please try again in ${wait}.`,

  landing: {
    title: 'Your event photos',
    description: 'Great to have you with us! Here you’ll find the photos from your event.',
    heading: 'Your photos from the event',
    lead1: 'Great to have you with us! 🍷',
    lead2: 'Enter the password you received and you’ll go straight to your photos.',
    passwordLabel: 'Password',
    placeholder: 'Password, e.g. riesling-karaffe-4827',
    submit: 'View photos',
    qrHint: 'Got a QR code? Just scan it with your phone camera – no password needed.',
    wrong: 'We couldn’t find an album for this password. Please check it again – upper and lower case, ' +
      'spaces and hyphens don’t matter.',
    attemptsLeft: (n: number) => ` (${n} ${n === 1 ? 'attempt' : 'attempts'} left, then there’s a short break.)`,
    qrInvalid: 'This QR code or link is no longer valid – perhaps the album is already offline. ' +
      'If you have the password, you can enter it here.',
    expired: 'Sorry, this album is no longer online. If you still need photos, please get in touch with the organiser.',
    unavailable: 'The photos can’t be reached right now. Please try again in a few minutes.'
  },

  unlock: {
    title: 'Password required',
    heading: 'Almost there!',
    lead: 'This album is protected by a password. Enter it here to see the photos.',
    passwordLabel: 'Password',
    placeholder: 'Password',
    submit: 'Unlock',
    invalidAgain: 'Sorry, the password is no longer correct. Please enter it again.',
    wrong: 'Sorry, that password isn’t right. Please check it again – upper and lower case and spaces don’t matter.',
    failed: 'Sorry, that didn’t work. Please try again.',
    offline: 'No connection. Please try again.',
    invalidRequest: 'Invalid request.'
  },

  licensePage: {
    title: 'License',
    heading: 'License & source code',
    intro: (ipp: ComponentChildren, agpl: ComponentChildren) => <>
      This photo portal is free software. It is based on {ipp} by Alan Grainger and, like the original,
      is licensed under the {agpl}.
    </>,
    source: 'You can find the complete source code of this version here:',
    fonts: 'Fonts used',
    note: 'This license applies to the software, not to the photos in the albums.'
  },

  notFound: {
    title: 'Not found',
    heading: 'Nothing (left) here',
    lead: 'This page doesn’t exist – or the album is no longer online.'
  },

  gallery: {
    fallbackTitle: 'Gallery',
    photos: (n: number) => n + (n === 1 ? ' photo' : ' photos'),
    videos: (n: number) => n + (n === 1 ? ' video' : ' videos'),
    empty: 'No photos yet',
    onlineUntil: 'online until',
    shareAlbum: 'Share album',
    downloadAllTitle: 'Download all photos as a ZIP file',
    downloadAllLabel: 'Download all',
    downloadAllAria: 'Download all photos',
    tip: (icon: ComponentChildren) => <>Tip: tap a photo and use {icon} to share it straight to WhatsApp.</>,
    selectCancel: 'End selection',
    selectDownload: 'Download selection',
    close: 'Close',
    dialogText: 'Let other guests scan this code with their phone camera – they’ll go straight to the album, ' +
      'no password needed.',
    shareLink: 'Share link',
    copyLink: 'Copy link',
    dialogNote: 'Please only pass it on to people who were there too. 🙂',
    albumShareText: (title: string) => `Here are the photos from “${title}” 📸`,
    shareText: 'That was “{title}” – photo {number} of {total}'
  },

  admin: {
    title: 'Photo admin',
    realm: 'Photo admin',
    tooManyFailures: (wait: string) => `Too many failed attempts. Please try again in ${wait}.`,
    loginRequired: 'Login required',
    invalidForm: 'Invalid request. Please reload the admin page and save again.',
    shareNotFound: 'Share not found',
    copied: 'Copied ✓',
    copyPrompt: 'Copy:',
    reachable: (n: number, link: ComponentChildren) => <>{n} {n === 1 ? 'album' : 'albums'} available at {link}</>,
    baseUrlMissing: (example: ComponentChildren) => <>
      <strong>PUBLIC_BASE_URL is missing.</strong> Set it in the stack, e.g. {example}, otherwise QR codes point to
      the wrong address.
    </>,
    immichError: 'No connection to Immich:',
    emptyHeading: 'No shares yet',
    emptyText: 'Create a password-protected share in Immich (see below) – it will then show up here automatically.',
    expiredHeading: 'Expired',
    expiredNote: 'Delete expired shares in Immich and they disappear from this list.',

    noExpiry: 'no expiry date',
    expiredOn: 'expired on',
    onlineUntil: 'online until',
    kindAlbum: 'Album',
    kindAssets: 'Individual photos',
    items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
    albumName: (name: string) => ` · album “${name}”`,
    statusActive: 'online',
    statusNoPassword: 'no password – only reachable via link/QR code',
    statusExpired: 'expired',
    duplicate: 'Duplicate password',
    duplicateTitle: 'Another active album has (almost) the same password. Guests will land in the newest one.',
    weak: 'Weak password',
    neverExpires: 'never expires',
    copyPasswordTitle: 'Copy password',
    copy: 'copy',
    noPassword: 'no password',
    copyLinkTitle: 'Copy the direct link (same as in the QR code)',
    copyLink: 'Copy link',
    card: 'Card',
    moreTitle: 'QR code and more',
    details: 'Details',
    noteNoPassword: 'Without a password this album can’t be reached from the home page – only via the link or QR code.',
    noteDuplicate: 'Another active album has (almost) the same password. Guests will land in the newest one – ' +
      'please change it.',
    qrPng: 'QR as PNG',
    qrSvg: 'QR as SVG',
    cardDark: 'Dark card',
    openGallery: 'Open gallery',

    settingsHeading: 'Guest downloads',
    valuePreview: 'reduced',
    valueOriginal: 'original',
    saved: 'Saved ✓ – applies to all albums right away.',
    notPersisted: (dataDir: ComponentChildren, doc: ComponentChildren) => <>
      <strong>Settings are not saved permanently.</strong> The portal’s data folder ({dataDir}) is not writable.
      Your choice only lasts until the next restart – see the section “Admin settings” in {doc}.
    </>,
    choicePreview: () => <>
      <strong>Reduced</strong> – the preview version from Immich (1440 px on the long side by default, usually under
      1 MB). Loads quickly even on the go and is fine for phones, WhatsApp and prints up to 10 × 15 cm.
    </>,
    choiceOriginal: () => <>
      <strong>Original</strong> – the uploaded file in full resolution (often 3–15 MB per photo, iPhone photos
      possibly as HEIC).
    </>,
    save: 'Save',
    settingsNote1: () => <>
      Applies to downloading single photos and to “Download all” (ZIP). In the gallery, guests always see the preview
      version. Videos are always downloaded in the original. Whether guests may download at all is set per album in
      Immich (<em>Allow download</em>).
    </>,
    settingsNote2: () => <>
      You set the size and quality of the reduced version in Immich: <em>Administration → Settings → Image settings →
      Preview</em> (e.g. 2160 px, quality 85). Then regenerate the thumbnails for <em>all</em> photos
      under <em>Jobs</em>.
    </>,

    helpHeading: 'Put a new album online',
    helpHint: 'Guide and password suggestions',
    helpSteps: () => [
      <>Create an album in Immich and upload the photos. The album name is the title guests see.</>,
      <>In the album, click <em>Share → Create link</em>. Set a <strong>password</strong> there, choose
        an <strong>expiry date</strong> (e.g. 60 days) and <em>Allow download</em> as you like.</>,
      <>Done – reload this page, print the QR code or card, or send the password to your guests.</>
    ],
    shareTextNote: (example: ComponentChildren) => <>
      Your own WhatsApp text for an album? In Immich, add a line like {example} to the album description.
      Use <code>Share:</code> for English and <code>Teilen:</code> for German guests; if there is only one, it is
      used for both.
    </>,
    shareTextExample: (brand: string) => `Share: That was the wine hike on the Saar with ${brand} 🍷 – photo {number} of {total}`,
    suggestionsHeading: 'Password suggestions',
    newSuggestions: 'New suggestions'
  },

  card: {
    title: 'Card',
    print: 'Print',
    light: 'Light version',
    dark: 'Dark version',
    hint: 'A6 format (105 × 148 mm). For 4 cards per sheet, choose “4 pages per sheet” on A4 in the print dialog.',
    kicker: 'Your photos from',
    scan: 'Scan with your phone camera',
    alt: (host: ComponentChildren, password: ComponentChildren) => <>
      or go to {host}<br/>and enter the password {password}
    </>,
    thanks: 'Great to have you with us! 🍷'
  }
}

export type Messages = typeof en

const de: Messages = {
  htmlLang: 'de',
  dateFormat: 'DD.MM.YYYY',
  languageName: 'Deutsch',
  languageSwitch: 'Sprache',
  defaultBrandName: 'Bilder-Portal',
  home: 'Startseite',
  imprint: 'Impressum',
  privacy: 'Datenschutz',
  license: 'Lizenz',
  licensePath: '/lizenz',
  toHome: 'Zur Startseite',

  wait: (seconds: number) => {
    if (seconds < 90) return 'einer Minute'
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 90) return minutes + ' Minuten'
    return Math.ceil(minutes / 60) + ' Stunden'
  },
  throttled: (wait: string) => `Das waren ein paar Versuche zu viel. Bitte probier es in ${wait} noch einmal.`,

  landing: {
    title: 'Deine Event-Bilder',
    description: 'Schön, dass du dabei warst! Hier findest du die Bilder von deinem Event.',
    heading: 'Deine Bilder vom Event',
    lead1: 'Schön, dass du dabei warst! 🍷',
    lead2: 'Gib hier das Passwort ein, das du bekommen hast – dann geht’s direkt zu deinen Bildern.',
    passwordLabel: 'Passwort',
    placeholder: 'Passwort, z.B. riesling-karaffe-4827',
    submit: 'Bilder ansehen',
    qrHint: 'Du hast einen QR-Code bekommen? Einfach mit der Handykamera scannen – dann brauchst du kein Passwort.',
    wrong: 'Zu diesem Passwort wurde kein Album gefunden. Schau nochmal genau hin – ' +
      'Groß- und Kleinschreibung, Leerzeichen und Bindestriche sind übrigens egal.',
    attemptsLeft: (n: number) => ` (Noch ${n} ${n === 1 ? 'Versuch' : 'Versuche'}, dann gibt’s eine kurze Pause.)`,
    qrInvalid: 'Dieser QR-Code bzw. Link ist nicht mehr gültig – vielleicht ist das Album schon offline. ' +
      'Wenn du das Passwort hast, kannst du es hier eingeben.',
    expired: 'Dieses Album ist leider nicht mehr online. Falls du noch Bilder brauchst, wende dich gerne an den Veranstalter.',
    unavailable: 'Die Bilder sind gerade nicht erreichbar. Bitte versuch es in ein paar Minuten noch einmal.'
  },

  unlock: {
    title: 'Passwort benötigt',
    heading: 'Fast geschafft!',
    lead: 'Dieses Album ist mit einem Passwort geschützt. Gib es hier ein, um die Bilder zu sehen.',
    passwordLabel: 'Passwort',
    placeholder: 'Passwort',
    submit: 'Entsperren',
    invalidAgain: 'Das Passwort stimmt leider nicht mehr. Bitte gib es noch einmal ein.',
    wrong: 'Das Passwort stimmt leider nicht. Schau nochmal genau hin – Groß-/Kleinschreibung und Leerzeichen sind egal.',
    failed: 'Das hat leider nicht geklappt. Bitte versuch es noch einmal.',
    offline: 'Keine Verbindung. Bitte versuch es noch einmal.',
    invalidRequest: 'Ungültige Anfrage.'
  },

  licensePage: {
    title: 'Lizenz',
    heading: 'Lizenz & Quellcode',
    intro: (ipp: ComponentChildren, agpl: ComponentChildren) => <>
      Dieses Bilder-Portal ist freie Software. Es basiert auf {ipp} von Alan Grainger und steht wie das Original
      unter der {agpl}.
    </>,
    source: 'Den vollständigen Quellcode dieser Version findest du hier:',
    fonts: 'Verwendete Schriften',
    note: 'Diese Lizenz gilt für die Software, nicht für die Bilder in den Alben.'
  },

  notFound: {
    title: 'Nicht gefunden',
    heading: 'Hier ist nichts (mehr)',
    lead: 'Diese Seite gibt es nicht – oder das Album ist nicht mehr online.'
  },

  gallery: {
    fallbackTitle: 'Galerie',
    photos: (n: number) => n + (n === 1 ? ' Foto' : ' Fotos'),
    videos: (n: number) => n + (n === 1 ? ' Video' : ' Videos'),
    empty: 'Noch keine Bilder',
    onlineUntil: 'online bis',
    shareAlbum: 'Album teilen',
    downloadAllTitle: 'Alle Bilder als ZIP herunterladen',
    downloadAllLabel: 'Alle laden',
    downloadAllAria: 'Alle Bilder herunterladen',
    tip: (icon: ComponentChildren) => <>Tipp: Bild antippen und über {icon} direkt per WhatsApp teilen.</>,
    selectCancel: 'Auswahl beenden',
    selectDownload: 'Auswahl herunterladen',
    close: 'Schließen',
    dialogText: 'Lass andere Gäste diesen Code mit der Handykamera scannen – dann sind sie ohne Passwort direkt im Album.',
    shareLink: 'Link teilen',
    copyLink: 'Link kopieren',
    dialogNote: 'Bitte nur an Leute weitergeben, die auch dabei waren. 🙂',
    albumShareText: (title: string) => `Hier sind die Bilder von „${title}“ 📸`,
    shareText: 'Das war „{titel}“ – Bild {nr} von {anzahl}'
  },

  admin: {
    title: 'Bilder-Admin',
    realm: 'Bilder-Admin',
    tooManyFailures: (wait: string) => `Zu viele Fehlversuche. Bitte in ${wait} erneut versuchen.`,
    loginRequired: 'Anmeldung erforderlich',
    invalidForm: 'Ungültige Anfrage. Bitte die Admin-Seite neu laden und erneut speichern.',
    shareNotFound: 'Freigabe nicht gefunden',
    copied: 'Kopiert ✓',
    copyPrompt: 'Zum Kopieren:',
    reachable: (n: number, link: ComponentChildren) => <>{n} {n === 1 ? 'Album' : 'Alben'} über {link} erreichbar</>,
    baseUrlMissing: (example: ComponentChildren) => <>
      <strong>PUBLIC_BASE_URL fehlt.</strong> Setze im Stack z.B. {example}, sonst zeigen QR-Codes auf die falsche
      Adresse.
    </>,
    immichError: 'Keine Verbindung zu Immich:',
    emptyHeading: 'Noch keine Freigaben',
    emptyText: 'Lege in Immich eine Freigabe mit Passwort an (siehe unten) – sie erscheint dann automatisch hier.',
    expiredHeading: 'Abgelaufen',
    expiredNote: 'Abgelaufene Freigaben löschst du in Immich, dann verschwinden sie hier.',

    noExpiry: 'ohne Ablaufdatum',
    expiredOn: 'abgelaufen am',
    onlineUntil: 'online bis',
    kindAlbum: 'Album',
    kindAssets: 'Einzelne Bilder',
    items: (n: number) => `${n} ${n === 1 ? 'Element' : 'Elemente'}`,
    albumName: (name: string) => ` · Album „${name}“`,
    statusActive: 'online',
    statusNoPassword: 'ohne Passwort – nur per Link/QR erreichbar',
    statusExpired: 'abgelaufen',
    duplicate: 'Passwort doppelt',
    duplicateTitle: 'Ein anderes aktives Album hat (fast) dasselbe Passwort. Gäste landen dann im neuesten.',
    weak: 'Passwort schwach',
    neverExpires: 'läuft nie ab',
    copyPasswordTitle: 'Passwort kopieren',
    copy: 'kopieren',
    noPassword: 'kein Passwort',
    copyLinkTitle: 'Direktlink (wie im QR-Code) kopieren',
    copyLink: 'Link kopieren',
    card: 'Karte',
    moreTitle: 'QR-Code und mehr',
    details: 'Details',
    noteNoPassword: 'Ohne Passwort ist dieses Album nicht über die Startseite erreichbar – nur über den Link bzw. QR-Code.',
    noteDuplicate: 'Ein anderes aktives Album hat (fast) dasselbe Passwort. Gäste landen dann im neuesten – bitte ändern.',
    qrPng: 'QR als PNG',
    qrSvg: 'QR als SVG',
    cardDark: 'Karte dunkel',
    openGallery: 'Galerie öffnen',

    settingsHeading: 'Download für Gäste',
    valuePreview: 'verkleinert',
    valueOriginal: 'Original',
    saved: 'Gespeichert ✓ – gilt ab sofort für alle Alben.',
    notPersisted: (dataDir: ComponentChildren, doc: ComponentChildren) => <>
      <strong>Einstellungen werden nicht dauerhaft gespeichert.</strong> Der Datenordner des Portals ({dataDir}) ist
      nicht beschreibbar. Die Auswahl gilt nur bis zum nächsten Neustart – siehe Abschnitt „Admin settings“ in {doc}.
    </>,
    choicePreview: () => <>
      <strong>Verkleinert</strong> – die Vorschau-Version aus Immich (Standard 1440 px an der langen Seite,
      meist unter 1 MB). Lädt schnell auch unterwegs und reicht für Handy, WhatsApp und Abzüge bis 10 × 15.
    </>,
    choiceOriginal: () => <>
      <strong>Original</strong> – die hochgeladene Datei in voller Auflösung (oft 3–15 MB pro Bild,
      iPhone-Fotos ggf. als HEIC).
    </>,
    save: 'Speichern',
    settingsNote1: () => <>
      Gilt für den Download einzelner Bilder und für „Alle herunterladen“ (ZIP). In der Galerie sehen Gäste immer die
      Vorschau-Version. Videos werden stets im Original geladen. Ob Gäste überhaupt herunterladen dürfen, legst du pro
      Album in Immich fest (<em>Download erlauben</em>).
    </>,
    settingsNote2: () => <>
      Größe und Qualität der verkleinerten Version stellst du in Immich ein: <em>Administration → Einstellungen →
      Bildeinstellungen → Vorschau</em> (z.B. 2160 px, Qualität 85). Danach unter <em>Aufträge</em> die
      Miniaturansichten für <em>alle</em> Bilder neu erzeugen lassen.
    </>,

    helpHeading: 'Neues Album online stellen',
    helpHint: 'Anleitung und Passwort-Vorschläge',
    helpSteps: () => [
      <>In Immich ein Album anlegen und die Bilder hochladen. Der Albumname ist der Titel, den Gäste sehen.</>,
      <>Im Album auf <em>Teilen → Link erstellen</em>. Dort ein <strong>Passwort</strong> setzen,
        ein <strong>Ablaufdatum</strong> wählen (z.B. 60 Tage) und <em>Download erlauben</em> nach Wunsch.</>,
      <>Fertig – diese Seite neu laden, QR-Code oder Karte drucken bzw. das Passwort an die Gäste schicken.</>
    ],
    shareTextNote: (example: ComponentChildren) => <>
      Eigener WhatsApp-Text für ein Album? In Immich in die Albumbeschreibung eine Zeile wie {example} schreiben.
      <code>Teilen:</code> gilt für deutsche, <code>Share:</code> für englische Gäste; steht nur eine da, gilt sie
      für beide.
    </>,
    shareTextExample: (brand: string) => `Teilen: Das war die Weinwanderung an der Saar mit ${brand} 🍷 – Bild {nr} von {anzahl}`,
    suggestionsHeading: 'Passwort-Vorschläge',
    newSuggestions: 'Neue Vorschläge'
  },

  card: {
    title: 'Karte',
    print: 'Drucken',
    light: 'Helle Variante',
    dark: 'Dunkle Variante',
    hint: 'Format A6 (105 × 148 mm). Für 4 Karten pro Blatt im Druckdialog „4 Seiten pro Blatt“ auf A4 wählen.',
    kicker: 'Deine Bilder von',
    scan: 'Mit der Handykamera scannen',
    alt: (host: ComponentChildren, password: ComponentChildren) => <>
      oder auf {host}<br/>mit dem Passwort {password}
    </>,
    thanks: 'Schön, dass du dabei warst! 🍷'
  }
}

const MESSAGES: Record<Lang, Messages> = { en, de }

export function t (lang: Lang): Messages {
  return MESSAGES[lang]
}

/** Fallback language: `portal.defaultLanguage` in config.json, else English. */
export function defaultLang (): Lang {
  const configured = getConfigOption('portal.defaultLanguage', 'en')
  return isLang(configured) ? configured : 'en'
}

function cookieValue (header: string | undefined, name: string): string | undefined {
  for (const part of (header || '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** First supported language in an Accept-Language header, by quality. */
export function acceptedLang (header: string | undefined): Lang | undefined {
  const ranked = (header || '').split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) : 1, index }
    })
    .filter(entry => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  return ranked.map(entry => entry.lang).find(isLang)
}

export function negotiateLang (cookieHeader: string | undefined, acceptLanguage: string | undefined): Lang {
  const chosen = cookieValue(cookieHeader, LANG_COOKIE)
  if (isLang(chosen)) return chosen
  return acceptedLang(acceptLanguage) || defaultLang()
}

/** Language picked for this request by languageMiddleware. */
export function langOf (res: Response): Lang {
  const lang = res.locals?.lang
  return isLang(lang) ? lang : defaultLang()
}

/** HTML that depends on the language must not be served from cache after a switch. */
export function varyLang (res: Response) {
  res.vary('Cookie')
  res.vary('Accept-Language')
}

/**
 * Pick the language for the request. `?lang=xx` on a GET (the language
 * switcher) stores the choice in a cookie and redirects to the same address
 * without the parameter.
 */
export function languageMiddleware (req: Request, res: Response, next: NextFunction) {
  const requested = req.query?.lang
  if (req.method === 'GET' && requested !== undefined) {
    if (isLang(requested)) {
      res.cookie(LANG_COOKIE, requested, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        path: '/'
      })
    }
    const url = new URL(req.originalUrl, 'http://localhost')
    // Drop only the lang parameter and keep the rest as written (e.g. "?dunkel")
    const query = url.search.slice(1).split('&').filter(part => part && part.split('=')[0] !== 'lang').join('&')
    res.set('Cache-Control', 'no-store')
    // Collapse leading slashes so "//host/..." can't become an open redirect
    res.redirect(303, url.pathname.replace(/^\/+/, '/') + (query ? '?' + query : ''))
    return
  }
  res.locals.lang = negotiateLang(req.headers.cookie, req.headers['accept-language'])
  next()
}
