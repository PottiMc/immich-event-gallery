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

  removal: {
    button: 'Remove photos',
    buttonTitle: 'Ask for photos to be removed for privacy reasons',
    title: 'Request photo removal',
    intro: 'Can you be recognised in a photo and don’t want it online? Select the photos and tell me why – ' +
      'I look at every request personally.',
    policy: 'This is about privacy: photos in which you or your child can clearly be recognised, or which show ' +
      'personal information. Please understand that I don’t remove photos just because you don’t like how ' +
      'you look in them.',
    selectHint: 'Tap the photos that should be removed:',
    next: 'Continue',
    back: 'Back',
    reasonLegend: 'Reason',
    reasons: {
      self: 'I can be recognised in the photo and object to it being published',
      child: 'My child (or a person I am responsible for) can be recognised',
      sensitive: 'The photo shows personal information (e.g. documents, number plate, screen)',
      other: 'Another privacy reason'
    } as Record<'self' | 'child' | 'sensitive' | 'other', string>,
    detailsLabel: 'Explanation',
    detailsPlaceholder: 'Who are you in the photo, and why should it be removed? ' +
      'E.g. “I’m the person in the red jacket on the left …”',
    nameLabel: 'Your name',
    emailLabel: 'Your e-mail address',
    emailHint: 'So I can get back to you. I only use it for this request.',
    confirm: 'My details are true, and this request is about privacy – not about how I look in the photo.',
    submit: 'Send request',
    doneHeading: 'Thank you!',
    doneText: 'Your request has reached me. I’ll look at it and get back to you by e-mail.',
    close: 'Close',
    errorInvalid: 'Please fill in all fields and select at least one photo.',
    errorTooMany: (max: number) => `Please select no more than ${max} photos per request.`,
    errorSend: 'Sorry, the request could not be sent. Please try again later.',
    throttled: (wait: string) => `You have already sent several requests. Please try again in ${wait}.`,
    // E-mail to the operator
    mailSubject: 'Please remove my photos',
    mailIntro: 'A guest asks for photos to be removed from the photo portal.',
    mailAlbum: 'Album',
    mailPhotos: 'Photos',
    mailPhotoOf: (n: number, total: number) => `Photo ${n} of ${total}`,
    mailReason: 'Reason',
    mailDetails: 'Explanation',
    mailName: 'Name',
    mailEmail: 'E-mail',
    mailReplyHint: '(replying to this e-mail goes straight to this address)',
    mailSent: 'Sent',
    mailGuestLang: 'guest language'
  },

  admin: {
    title: 'Photo admin',
    tabShares: 'Shares',
    tabBranding: 'Branding',
    tabStats: 'Statistics',
    tooManyFailures: (wait: string) => `Too many failed attempts. Please try again in ${wait}.`,
    loginRequired: 'Login required',
    loginTitle: 'Sign in',
    loginLead: 'Enter the admin password to manage shares, QR codes and branding.',
    loginPasswordLabel: 'Admin password',
    loginPlaceholder: 'Admin password',
    loginSubmit: 'Sign in',
    loginWrong: 'That password isn’t right.',
    logout: 'Sign out',
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
    statsLink: 'Statistics',

    settingsHeading: 'Guest downloads',
    valuePreview: 'reduced',
    valueOriginal: 'original',
    saved: 'Saved ✓ – applies to all albums right away.',
    notPersisted: (dataDir: ComponentChildren, doc: ComponentChildren) => <>
      <strong>Settings are not saved permanently.</strong> The portal’s data folder ({dataDir}) is not writable.
      Your choice only lasts until the next restart – see the section “Data folder” in {doc}.
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

  stats: {
    title: 'Statistics',
    intro: 'Visitors and downloads per day – to see whether an album is still in use.',
    filterShare: 'Share',
    allShares: 'All shares',
    deletedSuffix: '(deleted)',
    filterRange: 'Period',
    range30: 'Last 30 days',
    range90: 'Last 90 days',
    rangeAll: 'Since counting began',
    show: 'Show',
    showAll: 'show all shares',
    tileVisitors: 'Visitors, last 7 days',
    tileDownloads: 'Downloads, last 7 days',
    tileLastVisit: 'Last visit',
    tileLogins: 'Logins in the period',
    loginsDetail: (password: string, qr: string) => `${password} with password · ${qr} via QR code`,
    deltaUp: (pct: number) => `↑ ${pct} % compared with the 7 days before`,
    deltaDown: (pct: number) => `↓ ${pct} % compared with the 7 days before`,
    deltaSame: '→ as many as in the 7 days before',
    deltaNew: '↑ none in the 7 days before',
    deltaNone: 'none in the last 14 days',
    never: 'none yet',
    today: 'today',
    yesterday: 'yesterday',
    daysAgo: (n: number) => `${n} days ago`,
    chartVisitors: 'Visitors per day',
    chartVisitorsWeek: 'Visitors per week',
    chartDownloads: 'Downloaded photos per day',
    chartDownloadsWeek: 'Downloaded photos per week',
    inPeriod: (n: string) => `${n} in the period`,
    legendBars: 'Visitors',
    legendAverage: '7-day average',
    weekOf: (date: string) => `Week of ${date}`,
    shortDate: 'D MMM',
    tipVisitors: (date: string, visitors: string, views: string) => `${date}: ${visitors} visitors, ${views} page views`,
    tipAverage: (average: string) => ` · 7-day average ${average}`,
    tipDownloads: (date: string, photos: string, zips: string) => `${date}: ${photos} photos downloaded, ${zips} ZIP downloads`,
    emptyVisitors: 'No visitors in this period.',
    emptyDownloads: 'No downloads in this period.',
    tableToggle: 'Show as table',
    colDay: 'Day',
    colWeek: 'Week',
    colVisitors: 'Visitors',
    colViews: 'Page views',
    colDownloads: 'Downloads',
    colZips: 'ZIPs',
    colLogins: 'Password logins',
    colQr: 'QR logins',
    sharesHeading: 'Per share',
    colShare: 'Share',
    col30: 'Visitors, 30 days',
    col7: '7 days',
    colTotal: 'Visitors in total',
    colDownloadsTotal: 'Downloads in total',
    colLast: 'Last visit',
    prevWeekTitle: (n: number) => `The 7 days before: ${n}`,
    statusDeleted: 'deleted in Immich',
    quiet: (days: number) => `No visit for ${days} days – can go`,
    neverVisited: 'Never visited – can go',
    quietNote: 'Shares that are still online but have had no visitor for 14 days are marked. You take the link ' +
      'offline in Immich (delete the share or let it expire). The statistics stay here until you delete them.',
    deleteStats: 'delete statistics',
    deleteConfirm: 'Delete the statistics of this share for good?',
    deleted: 'Statistics deleted ✓',
    notPersisted: (dataDir: ComponentChildren) => <>
      <strong>Statistics are not saved permanently.</strong> The portal’s data folder ({dataDir}) is not writable, so
      the numbers are lost on the next restart.
    </>,
    countNote: 'How counting works: a guest counts once per day and share, however often they reload. Link previews ' +
      '(WhatsApp, Telegram …) and bots are left out. Downloads count photos, including each photo in a ZIP. Only ' +
      'daily totals are stored – no IP addresses, no cookies. Counting started with this version of the portal.'
  },

  branding: {
    title: 'Branding',
    intro: 'Name, links, share text and images of your portal. Changes take effect right away and are stored in the ' +
      'portal’s data folder. They take precedence over the branding folder on the server.',
    notWritable: (dataDir: ComponentChildren) => <>
      <strong>Nothing can be saved here.</strong> The portal’s data folder ({dataDir}) is not writable. See the section
      “Data folder” in <code>docs/configuration.md</code>.
    </>,
    sourceAdmin: 'set here',
    sourceFolder: 'branding folder',
    sourceDefault: 'default',

    textsHeading: 'Texts and links',
    brandName: 'Name',
    brandNameHint: 'Shown in page titles, image descriptions and link previews. Empty = neutral name.',
    websiteUrl: 'Website',
    websiteUrlHint: 'Link in the footer. Empty = hidden.',
    imprintUrl: 'Legal notice',
    imprintUrlHint: 'Link in the footer (“Impressum”, mandatory in Germany). Empty = hidden.',
    privacyUrl: 'Privacy policy',
    privacyUrlHint: 'Link in the footer. Empty = hidden.',
    shareUrl: 'Link when sharing photos',
    shareUrlHint: 'Added below every shared photo – your website, not the album. Empty = no link.',
    shareTextEn: 'Share text for English guests',
    shareTextDe: 'Share text for German guests',
    shareTextHint: (placeholders: ComponentChildren) => <>
      Sent along when a guest shares a photo. Placeholders: {placeholders}. Empty = default text. A line
      “Share: …” / “Teilen: …” in an album description overrides it for that album.
    </>,
    save: 'Save texts',
    saved: 'Saved ✓ – the guest pages show the new texts right away.',
    textsReset: 'Reset ✓ – the texts from the branding folder or the defaults apply again.',
    resetTexts: 'Reset texts',
    resetTextsHint: 'Removes the texts saved here. Then the branding folder or the defaults apply again.',
    invalidUrl: (field: string) => `“${field}” needs a full address starting with https://, or leave it empty.`,
    tooLong: (field: string) => `“${field}” is too long.`,
    saveFailed: 'Could not save. Is the data folder writable?',

    imagesHeading: 'Logos and icons',
    imagesIntro: 'PNG with a transparent background works best for the logos. Maximum 5 MB per file.',
    recommended: 'Recommended',
    current: 'Current',
    ratioWarning: 'Different aspect ratio than recommended – the image may look squashed or have wide margins.',
    upload: 'Upload new image',
    uploading: 'Uploading …',
    resetImage: 'Reset',
    imageSaved: 'Image saved ✓',
    imageReset: 'Image reset ✓',
    wrongType: (format: string) => `Please choose a ${format} file.`,
    tooLarge: 'The file is larger than 5 MB.',
    uploadFailed: 'Upload failed. Please reload the page and try again.',
    slots: {
      'logo-banner.png': ['Logo for dark backgrounds', 'Top of every page and the dark print card'],
      'logo-light.png': ['Logo for light backgrounds', 'The light print card'],
      'icon-192.png': ['App icon', 'Browser and Android home screen'],
      'apple-touch-icon.png': ['iPhone icon', 'Home screen on iPhone and iPad; no transparency'],
      'og-image.jpg': ['Link preview', 'Shown when the portal address is shared on WhatsApp, Signal & co.'],
      'favicon.ico': ['Favicon', 'Browser tab']
    } as Record<string, [string, string]>,
    viewSite: 'Open the guest page'
  },

  card: {
    title: 'Card',
    print: 'Print / save as PDF',
    dark: 'Dark version',
    titleLabel: 'Title',
    dateLabel: 'Date',
    datePlaceholder: 'e.g. 24 Sep 2026',
    layoutLabel: 'Layout',
    layoutSheet: '4 per A4 sheet',
    layoutSingle: 'Single card A6',
    hintSheet: 'Print on A4 at 100 % (“Actual size”, not “Fit to page”), or choose “Save as PDF” as the printer. ' +
      'Cut along the crop marks: each card is 94 × 132.5 mm.',
    hintSingle: 'A6 format (105 × 148 mm), e.g. for a print shop or a photo printer.',
    kicker: 'Your photos from',
    scan: 'Scan with your phone camera',
    altSite: (host: ComponentChildren) => <>or go to {host}</>,
    altPassword: (password: ComponentChildren) => <>and enter the password {password}</>,
    thanks: 'Great to have you with us!'
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

  removal: {
    button: 'Bilder entfernen',
    buttonTitle: 'Entfernung von Bildern aus Datenschutzgründen beantragen',
    title: 'Bilder entfernen lassen',
    intro: 'Du bist auf einem Bild zu erkennen und möchtest nicht, dass es online ist? Wähl die Bilder aus und ' +
      'sag mir kurz, warum – ich schaue mir jede Anfrage persönlich an.',
    policy: 'Es geht um Datenschutz: Bilder, auf denen du oder dein Kind klar zu erkennen seid, oder die ' +
      'persönliche Informationen zeigen. Bitte hab Verständnis, dass ich Bilder nicht entferne, nur weil man ' +
      'darauf nicht so vorteilhaft aussieht.',
    selectHint: 'Tipp die Bilder an, die entfernt werden sollen:',
    next: 'Weiter',
    back: 'Zurück',
    reasonLegend: 'Grund',
    reasons: {
      self: 'Ich bin auf dem Bild zu erkennen und widerspreche der Veröffentlichung',
      child: 'Mein Kind (oder eine Person, für die ich verantwortlich bin) ist zu erkennen',
      sensitive: 'Das Bild zeigt persönliche Informationen (z. B. Dokumente, Kennzeichen, Bildschirm)',
      other: 'Ein anderer Datenschutzgrund'
    },
    detailsLabel: 'Erläuterung',
    detailsPlaceholder: 'Wer bist du auf dem Bild, und warum soll es entfernt werden? ' +
      'Z. B. „Ich bin die Person mit der roten Jacke links …“',
    nameLabel: 'Dein Name',
    emailLabel: 'Deine E-Mail-Adresse',
    emailHint: 'Damit ich dir antworten kann. Ich nutze sie nur für diese Anfrage.',
    confirm: 'Meine Angaben stimmen, und es geht mir um Datenschutz – nicht darum, wie ich auf dem Bild aussehe.',
    submit: 'Anfrage senden',
    doneHeading: 'Danke!',
    doneText: 'Deine Anfrage ist bei mir angekommen. Ich schaue sie mir an und melde mich per E-Mail bei dir.',
    close: 'Schließen',
    errorInvalid: 'Bitte füll alle Felder aus und wähl mindestens ein Bild aus.',
    errorTooMany: (max: number) => `Bitte wähl höchstens ${max} Bilder pro Anfrage aus.`,
    errorSend: 'Die Anfrage konnte leider nicht gesendet werden. Bitte versuch es später noch einmal.',
    throttled: (wait: string) => `Du hast schon mehrere Anfragen gesendet. Bitte versuch es in ${wait} noch einmal.`,
    mailSubject: 'Bitte meine Bilder entfernen',
    mailIntro: 'Ein Gast bittet darum, Bilder aus dem Bilder-Portal zu entfernen.',
    mailAlbum: 'Album',
    mailPhotos: 'Bilder',
    mailPhotoOf: (n: number, total: number) => `Bild ${n} von ${total}`,
    mailReason: 'Grund',
    mailDetails: 'Erläuterung',
    mailName: 'Name',
    mailEmail: 'E-Mail',
    mailReplyHint: '(Antworten auf diese Mail gehen direkt an diese Adresse)',
    mailSent: 'Gesendet',
    mailGuestLang: 'Sprache des Gastes'
  },

  admin: {
    title: 'Bilder-Admin',
    tabShares: 'Freigaben',
    tabBranding: 'Branding',
    tabStats: 'Statistik',
    tooManyFailures: (wait: string) => `Zu viele Fehlversuche. Bitte in ${wait} erneut versuchen.`,
    loginRequired: 'Anmeldung erforderlich',
    loginTitle: 'Anmelden',
    loginLead: 'Gib das Admin-Passwort ein, um Freigaben, QR-Codes und Branding zu verwalten.',
    loginPasswordLabel: 'Admin-Passwort',
    loginPlaceholder: 'Admin-Passwort',
    loginSubmit: 'Anmelden',
    loginWrong: 'Das Passwort stimmt nicht.',
    logout: 'Abmelden',
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
    statsLink: 'Statistik',

    settingsHeading: 'Download für Gäste',
    valuePreview: 'verkleinert',
    valueOriginal: 'Original',
    saved: 'Gespeichert ✓ – gilt ab sofort für alle Alben.',
    notPersisted: (dataDir: ComponentChildren, doc: ComponentChildren) => <>
      <strong>Einstellungen werden nicht dauerhaft gespeichert.</strong> Der Datenordner des Portals ({dataDir}) ist
      nicht beschreibbar. Die Auswahl gilt nur bis zum nächsten Neustart – siehe Abschnitt „Data folder“ in {doc}.
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

  stats: {
    title: 'Statistik',
    intro: 'Besucher und Downloads pro Tag – damit du siehst, ob ein Album noch genutzt wird.',
    filterShare: 'Freigabe',
    allShares: 'Alle Freigaben',
    deletedSuffix: '(gelöscht)',
    filterRange: 'Zeitraum',
    range30: 'Letzte 30 Tage',
    range90: 'Letzte 90 Tage',
    rangeAll: 'Seit Beginn der Zählung',
    show: 'Anzeigen',
    showAll: 'alle Freigaben zeigen',
    tileVisitors: 'Besucher, letzte 7 Tage',
    tileDownloads: 'Downloads, letzte 7 Tage',
    tileLastVisit: 'Letzter Besuch',
    tileLogins: 'Anmeldungen im Zeitraum',
    loginsDetail: (password: string, qr: string) => `${password} mit Passwort · ${qr} per QR-Code`,
    deltaUp: (pct: number) => `↑ ${pct} % mehr als in den 7 Tagen davor`,
    deltaDown: (pct: number) => `↓ ${pct} % weniger als in den 7 Tagen davor`,
    deltaSame: '→ so viele wie in den 7 Tagen davor',
    deltaNew: '↑ in den 7 Tagen davor keine',
    deltaNone: 'keine in den letzten 14 Tagen',
    never: 'noch keiner',
    today: 'heute',
    yesterday: 'gestern',
    daysAgo: (n: number) => `vor ${n} Tagen`,
    chartVisitors: 'Besucher pro Tag',
    chartVisitorsWeek: 'Besucher pro Woche',
    chartDownloads: 'Heruntergeladene Bilder pro Tag',
    chartDownloadsWeek: 'Heruntergeladene Bilder pro Woche',
    inPeriod: (n: string) => `${n} im Zeitraum`,
    legendBars: 'Besucher',
    legendAverage: '7-Tage-Schnitt',
    weekOf: (date: string) => `Woche ab ${date}`,
    shortDate: 'DD.MM.',
    tipVisitors: (date: string, visitors: string, views: string) => `${date}: ${visitors} Besucher, ${views} Seitenaufrufe`,
    tipAverage: (average: string) => ` · 7-Tage-Schnitt ${average}`,
    tipDownloads: (date: string, photos: string, zips: string) => `${date}: ${photos} Bilder heruntergeladen, ${zips} ZIP-Downloads`,
    emptyVisitors: 'Keine Besucher in diesem Zeitraum.',
    emptyDownloads: 'Keine Downloads in diesem Zeitraum.',
    tableToggle: 'Als Tabelle anzeigen',
    colDay: 'Tag',
    colWeek: 'Woche',
    colVisitors: 'Besucher',
    colViews: 'Seitenaufrufe',
    colDownloads: 'Downloads',
    colZips: 'ZIPs',
    colLogins: 'Anmeldungen Passwort',
    colQr: 'Anmeldungen QR',
    sharesHeading: 'Pro Freigabe',
    colShare: 'Freigabe',
    col30: 'Besucher, 30 Tage',
    col7: '7 Tage',
    colTotal: 'Besucher gesamt',
    colDownloadsTotal: 'Downloads gesamt',
    colLast: 'Letzter Besuch',
    prevWeekTitle: (n: number) => `Die 7 Tage davor: ${n}`,
    statusDeleted: 'in Immich gelöscht',
    quiet: (days: number) => `Seit ${days} Tagen kein Besuch – kann weg`,
    neverVisited: 'Nie besucht – kann weg',
    quietNote: 'Markiert sind Freigaben, die noch online sind, aber seit 14 Tagen keinen Besucher hatten. Den Link nimmst ' +
      'du in Immich offline (Freigabe löschen oder ablaufen lassen). Die Statistik bleibt hier, bis du sie löschst.',
    deleteStats: 'Statistik löschen',
    deleteConfirm: 'Die Statistik dieser Freigabe endgültig löschen?',
    deleted: 'Statistik gelöscht ✓',
    notPersisted: (dataDir: ComponentChildren) => <>
      <strong>Die Statistik wird nicht dauerhaft gespeichert.</strong> Der Datenordner des Portals ({dataDir}) ist
      nicht beschreibbar, beim nächsten Neustart sind die Zahlen weg.
    </>,
    countNote: 'So wird gezählt: Ein Gast zählt pro Tag und Freigabe einmal, egal wie oft er neu lädt. Link-Vorschauen ' +
      '(WhatsApp, Telegram …) und Bots zählen nicht mit. Downloads zählen Bilder, auch jedes Bild in einem ZIP. ' +
      'Gespeichert werden nur Tagessummen – keine IP-Adressen, keine Cookies. Gezählt wird ab dieser Version des Portals.'
  },

  branding: {
    title: 'Branding',
    intro: 'Name, Links, Teilen-Text und Bilder deines Portals. Änderungen gelten sofort und werden im Datenordner des ' +
      'Portals gespeichert. Sie haben Vorrang vor dem Branding-Ordner auf dem Server.',
    notWritable: (dataDir: ComponentChildren) => <>
      <strong>Hier kann nichts gespeichert werden.</strong> Der Datenordner des Portals ({dataDir}) ist nicht
      beschreibbar. Siehe Abschnitt „Data folder“ in <code>docs/configuration.md</code>.
    </>,
    sourceAdmin: 'hier gesetzt',
    sourceFolder: 'Branding-Ordner',
    sourceDefault: 'Standard',

    textsHeading: 'Texte und Links',
    brandName: 'Name',
    brandNameHint: 'Steht in Seitentiteln, Bildbeschreibungen und Link-Vorschauen. Leer = neutraler Name.',
    websiteUrl: 'Website',
    websiteUrlHint: 'Link in der Fußzeile. Leer = ausgeblendet.',
    imprintUrl: 'Impressum',
    imprintUrlHint: 'Link in der Fußzeile, in Deutschland Pflicht. Leer = ausgeblendet.',
    privacyUrl: 'Datenschutz',
    privacyUrlHint: 'Link in der Fußzeile. Leer = ausgeblendet.',
    shareUrl: 'Link beim Teilen von Bildern',
    shareUrlHint: 'Steht unter jedem geteilten Bild – deine Website, nicht das Album. Leer = kein Link.',
    shareTextEn: 'Teilen-Text für englische Gäste',
    shareTextDe: 'Teilen-Text für deutsche Gäste',
    shareTextHint: (placeholders: ComponentChildren) => <>
      Wird mitgeschickt, wenn ein Gast ein Bild teilt. Platzhalter: {placeholders}. Leer = Standardtext. Eine Zeile
      „Share: …“ / „Teilen: …“ in der Albumbeschreibung ersetzt ihn für dieses Album.
    </>,
    save: 'Texte speichern',
    saved: 'Gespeichert ✓ – die Gästeseiten zeigen die neuen Texte sofort.',
    textsReset: 'Zurückgesetzt ✓ – es gelten wieder die Texte aus dem Branding-Ordner bzw. die Standards.',
    resetTexts: 'Texte zurücksetzen',
    resetTextsHint: 'Entfernt die hier gespeicherten Texte. Dann gelten wieder der Branding-Ordner bzw. die Standards.',
    invalidUrl: (field: string) => `„${field}“ braucht eine vollständige Adresse mit https:// – oder bleibt leer.`,
    tooLong: (field: string) => `„${field}“ ist zu lang.`,
    saveFailed: 'Speichern hat nicht geklappt. Ist der Datenordner beschreibbar?',

    imagesHeading: 'Logos und Icons',
    imagesIntro: 'Für die Logos am besten PNG mit transparentem Hintergrund. Höchstens 5 MB pro Datei.',
    recommended: 'Empfohlen',
    current: 'Aktuell',
    ratioWarning: 'Anderes Seitenverhältnis als empfohlen – das Bild wirkt evtl. gestaucht oder hat breite Ränder.',
    upload: 'Neues Bild hochladen',
    uploading: 'Wird hochgeladen …',
    resetImage: 'Zurücksetzen',
    imageSaved: 'Bild gespeichert ✓',
    imageReset: 'Bild zurückgesetzt ✓',
    wrongType: (format: string) => `Bitte eine ${format}-Datei wählen.`,
    tooLarge: 'Die Datei ist größer als 5 MB.',
    uploadFailed: 'Hochladen hat nicht geklappt. Bitte Seite neu laden und nochmal versuchen.',
    slots: {
      'logo-banner.png': ['Logo für dunklen Hintergrund', 'Oben auf allen Seiten und auf der dunklen Druckkarte'],
      'logo-light.png': ['Logo für hellen Hintergrund', 'Die helle Druckkarte'],
      'icon-192.png': ['App-Icon', 'Browser und Startbildschirm auf Android'],
      'apple-touch-icon.png': ['iPhone-Icon', 'Startbildschirm auf iPhone und iPad; ohne Transparenz'],
      'og-image.jpg': ['Link-Vorschau', 'Erscheint, wenn die Portal-Adresse per WhatsApp, Signal & Co. geteilt wird'],
      'favicon.ico': ['Favicon', 'Browser-Tab']
    } as Record<string, [string, string]>,
    viewSite: 'Gästeseite öffnen'
  },

  card: {
    title: 'Karte',
    print: 'Drucken / als PDF speichern',
    dark: 'Dunkle Variante',
    titleLabel: 'Titel',
    dateLabel: 'Datum',
    datePlaceholder: 'z. B. 24.09.2026',
    layoutLabel: 'Format',
    layoutSheet: '4 pro A4-Blatt',
    layoutSingle: 'Einzelkarte A6',
    hintSheet: 'Auf A4 in Originalgröße drucken (100 %, nicht „An Seite anpassen“) oder als Drucker „Als PDF speichern“ ' +
      'wählen. An den Schnittmarken schneiden: jede Karte ist 94 × 132,5 mm groß.',
    hintSingle: 'Format A6 (105 × 148 mm), z. B. für die Druckerei oder einen Fotodrucker.',
    kicker: 'Deine Bilder von',
    scan: 'Mit der Handykamera scannen',
    altSite: (host: ComponentChildren) => <>oder auf {host}</>,
    altPassword: (password: ComponentChildren) => <>mit dem Passwort {password}</>,
    thanks: 'Schön, dass du dabei warst!'
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

export function cookieValue (header: string | undefined, name: string): string | undefined {
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
