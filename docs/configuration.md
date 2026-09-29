# Configuration

The portal is configured in three places:

- **Environment variables** hold secrets and deployment values. They are set in `.env` and passed through
  `docker-compose.yml`.
- **The branding folder** holds your logos, icons and brand texts. It is mounted into the container and is never part
  of the repository or the image.
- **`app/config.json`** holds gallery behaviour. It is baked into the image and can be overridden at runtime.

A few settings can also be changed on the admin page, see [Admin settings](#admin-settings).

## Environment variables

### Portal container

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `IMMICH_URL` | yes | – | Internal URL of Immich, as reached from the portal container. Set by the compose file to `http://immich-server:2283`. |
| `IMMICH_API_KEY` | yes | – | Immich API key with **only** the `sharedLink.read` permission. It is used to list shared links and match passwords. |
| `PORTAL_SECRET` | yes | random | At least 32 characters. Session cookies and QR tokens are derived from it. If it is missing, a random secret is used, and every restart logs out all guests and invalidates all QR codes. |
| `PUBLIC_BASE_URL` | recommended | from request | Public address of the guest portal without a trailing slash. It is used for QR codes, printed cards and link previews. |
| `PORTAL_ADMIN_PASSWORD` | no | – | Enables the admin server. You sign in on its login page (password managers can fill it in) and stay signed in for 7 days; changing the password signs every browser out. Scripts can send it as HTTP Basic Auth (any username). Without it, the admin server does not start. |
| `PORTAL_ADMIN_PORT` | no | `3001` | Port of the admin server **inside** the container. |
| `TRUST_PROXY` | no | private networks | Express [`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html) setting: `true`, `false`, a hop count, or a comma-separated list of addresses or subnets. The default is `loopback, linklocal, uniquelocal`. Only trusted proxies may set the client IP that the lockout counts. |
| `IPP_PORT` | no | `3000` | Port of the guest portal inside the container. |
| `IPP_CONFIG` | no | `/app/config.json` | Path to an alternative config file. |
| `CONFIG` | no | – | The complete config as an inline JSON string. When set, no file is read. |
| `BRANDING_DIR` | no | `/app/branding` | Branding folder inside the container, see [Branding](#branding). |
| `DATA_DIR` | no | `/app/data` | Writable folder for the settings saved on the admin page and the statistics, see [Data folder](#data-folder). |
| `TZ` | no | `Europe/Berlin` | Time zone for logs and dates. |

#### E-mail (optional)

Removal requests and the newsletter sign-up send e-mail over SMTP. E-mail counts as set up when `SMTP_HOST` is set
and the sender address is valid. At startup the portal logs one line with host, port, encryption, sender and whether
a login is set (never the password). Every send uses its own connection with a 25-second timeout, one at a time.
Mails carry a display name, `Date`, a `Message-ID` on the sender's domain and `Auto-Submitted: auto-generated`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SMTP_HOST` | yes | – | SMTP relay, e.g. `smtp-relay.brevo.com`. Empty = no e-mail at all |
| `SMTP_PORT` | no | `587` | SMTP port |
| `SMTP_SECURITY` | no | `ssl` on port 465, else `starttls` | `starttls`, `ssl` or `none` (`keine` works too). The older `SMTP_SECURE=true\|false` is still read. |
| `SMTP_USER`, `SMTP_PASS` | no | – | SMTP login |
| `SMTP_FROM` | yes | `SMTP_USER` | Sender address, verified with your mail provider. May be `Name <address>`. |
| `SMTP_NAME` | no | the name from `SMTP_FROM`, else the brand name | Display name of the sender |
| `REMOVAL_REQUEST_LANG` | no | `portal.defaultLanguage` | Language of the e-mails to you (`en` or `de`) |

The *Newsletter* tab on the admin page shows these settings (without the password) and can send a test e-mail to
the sender address. SMTP errors are explained there and in the log: login rejected, sender rejected, recipient
rejected, server unreachable, or encryption not matching the port.

#### Removal requests (optional)

With e-mail set up and `REMOVAL_REQUEST_TO` set, the gallery shows a *Remove photos* button. Guests select photos, pick
a privacy reason (they can be recognised, their child can be recognised, the photo shows personal information, or
another privacy reason), explain it, enter their name and e-mail address and confirm that the request is about
privacy and not about how they look. The portal then sends a plain-text e-mail listing the photos (number in the
album, file name, time taken and a link or ID), the reason and the guest's details. Replying to it goes straight to
the guest. Each IP can send 3 requests per hour, all guests together 30; at most 50 photos per request. Nothing is
changed in Immich: you decide and remove the photos yourself.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REMOVAL_REQUEST_TO` | yes | – | Address that receives the requests |
| `IMMICH_ADMIN_URL` | no | – | Address of your Immich web UI, e.g. `https://immich.example.com`. The e-mail then links every photo to `…/photos/<id>` instead of only listing its ID. |

#### Newsletter sign-up (optional)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEWSLETTER_NOTIFY` | no | the `SMTP_FROM` address | Receives an e-mail for every confirmed sign-up |

See [Newsletter](#newsletter) for how it works.

### Compose only (`.env`)

These are used by `docker-compose.yml` itself and are not passed to the portal:

| Variable | Default | Purpose |
|---|---|---|
| `UPLOAD_LOCATION` | – | Host folder for photos, videos and Immich's database dumps |
| `DB_DATA_LOCATION` | – | Host folder for the Postgres data (local disk only) |
| `BRANDING_LOCATION` | `./branding` | Host folder with your logos, icons and `branding.json`, mounted read-only |
| `DB_PASSWORD` | – | Postgres password (letters and digits only) |
| `IMMICH_VERSION` | `v3` | Immich image tag |
| `BIND_IP` | `0.0.0.0` | Host address the published ports listen on |
| `IMMICH_HOST_PORT` | `2284` | Host port of the Immich web UI |
| `PORTAL_HOST_PORT` | `3100` | Host port of the guest portal |
| `ADMIN_HOST_PORT` | `3101` | Host port of the admin pages |
| `PORTAL_CPUS` | `1` | CPU cores the portal may use |
| `IMMICH_CPUS` | `2` | CPU cores the Immich server may use. Keeps a request flood or a big import from slowing down the whole host |
| `ML_CPUS` | `2` | CPU cores machine learning may use. Lower it to make face recognition slower but gentler |
| `PORTAL_IMAGE` | `ghcr.io/pottimc/immich-event-gallery:latest` | Portal image. Pin a version or SHA tag for reproducible deployments. |

## Branding

Without any branding the portal is neutral: it is called "Photo Portal" ("Bilder-Portal" in German), shows a generic
picture icon, and hides the website, imprint and privacy links. There are two ways to add your own brand, and neither
ends up in the repository or the image, so nobody who pulls the project gets your logos:

- **On the admin page** (tab *Branding*): edit the name, links and share texts, pick the colors, and upload logos and icons. Changes
  take effect immediately. They are stored in `DATA_DIR/branding/` (the writable data volume) and take precedence
  over the branding folder. *Reset* removes a value set there, so the branding folder or the default applies again.
  Uploads must be PNG (logos and icons), JPEG (`og-image.jpg`) or ICO/PNG (`favicon.ico`), at most 5 MB each; SVG is
  not accepted. The page shows the recommended and the actual size of every image.
- **In a branding folder** on the server (`BRANDING_LOCATION`), mounted read-only at `/app/branding`. This suits
  operators who prefer files, and it is the fallback for everything not set on the admin page.

Every file is optional. Whatever is missing falls back to the neutral default in
[`app/public/brand/`](../app/public/brand/).

| File | Size | Used for |
|---|---|---|
| `logo-banner.png` | 732 × 283, transparent | Header of all pages (dark background) and the dark print card |
| `logo-light.png` | 484 × 700, transparent | Light print card |
| `icon-192.png` | 192 × 192 | Browser icon |
| `apple-touch-icon.png` | 180 × 180, opaque | Home-screen icon on iOS |
| `og-image.jpg` | 1200 × 630 | Link preview of the landing page (WhatsApp, Signal, …) |
| `favicon.ico` | 16–64 px | Browser tab |
| `branding.json` | – | Brand texts and colors, see below. It is never served to visitors. |

`branding.json`:

```json
{
  "brandName": "Weingut Beispiel",
  "websiteUrl": "https://weingut.example",
  "imprintUrl": "https://weingut.example/impressum",
  "privacyUrl": "https://weingut.example/datenschutz",
  "shareText": {
    "en": "That was “{title}” with Weingut Beispiel 🍷 – photo {number} of {total}",
    "de": "Das war „{titel}“ mit dem Weingut Beispiel 🍷 – Bild {nr} von {anzahl}"
  },
  "shareUrl": "https://weingut.example",
  "newsletterText": {
    "en": "New wine tastings and hikes, about once a month.",
    "de": "Neue Weinproben und Wanderungen, etwa einmal im Monat."
  },
  "phone": "+49 170 1234567",
  "instagramUrl": "https://instagram.com/weingut.beispiel",
  "colors": {
    "accent": "#ccac39",
    "button": "#a3005a",
    "background": "#0d0b0a",
    "text": "#f4efe6"
  }
}
```

| Key | Default | Purpose |
|---|---|---|
| `brandName` | `Photo Portal` / `Bilder-Portal` | Name in page titles, image alt texts and link previews |
| `websiteUrl` | empty (hidden) | Website link in the footer |
| `imprintUrl` | empty (hidden) | Imprint link in the footer. In Germany an imprint is mandatory. |
| `privacyUrl` | empty (hidden) | Privacy policy link in the footer |
| `shareText` | `That was “{title}” – photo {number} of {total}` / German equivalent | Default text when a guest shares a photo |
| `shareUrl` | `websiteUrl` | Link appended to shared photos (your website, not the album). Empty = no link. |
| `newsletterText` | `News and upcoming events straight to your inbox.` / German equivalent | Text above the [newsletter](#newsletter) sign-up in the albums |
| `phone` | empty (left out) | Phone / WhatsApp number in the signature of the newsletter confirmation e-mail |
| `instagramUrl` | empty (left out) | Instagram profile in the signature of the newsletter confirmation e-mail |
| `colors` | the values in the example | Brand colors as `#rrggbb`, see [Colors](#colors). Each one is optional. |
| `sourceUrl` | this repository | Source code link on the licence page (`/license`, also `/lizenz`, linked as "License" in the footer). The AGPL requires it to point to the source of the version you run. |

Every text value can be a plain string, used for all languages, or one string per language such as
`{ "en": "…", "de": "…" }`. A missing language falls back to `portal.defaultLanguage`, then to any other.

The share text placeholders are `{title}` (album title), `{number}` (photo number) and `{total}` (total number of
photos); the German `{titel}`, `{nr}` and `{anzahl}` work as well. A single album can override the text with a line
`Share: …` (English guests) or `Teilen: …` (German guests) in its Immich album description. If only one of them is
there, it is used for both languages. The portal hides these lines from guests.

The same keys are also read from the `portal` block of `config.json`, with `branding.json` taking precedence.
Texts in the branding folder are read once at startup, so restart the container after changing its `branding.json`
(changes on the admin page need no restart). Images are picked up immediately: pages link them with a version taken
from the file, so browsers load a new logo right away.

For local development, put the folder at `app/branding/`, which is gitignored.

### Colors

Four colors define the look; every other shade is derived from them, so they always fit together:

| Color | Used for |
|---|---|
| `accent` | Headings, links, frames and icons. Lighter shades mix in the text color; the print card uses a darkened shade that stays readable on white paper. |
| `button` | Main buttons. Their label turns white or dark, whichever reads better. |
| `background` | Page background; boxes are a little lighter. A light background switches the pages (form fields, status colors) to a light look. The header logo is `logo-banner.png` either way, so upload one that works on your background. |
| `text` | Running text. The grey of notes and placeholders is mixed from text and background. |

The colors apply to the guest pages, the print card and the admin area. The admin page shows a live preview and warns
when text, accent or buttons have too little contrast against the background. A color set there takes precedence over
the same color in `branding.json`; picking the value from the branding folder (or the default) again, or *Reset
colors*, removes it. Without any colors the stylesheets keep their built-in defaults.

## Admin settings

Besides [branding](#branding), the admin page has a section **Guest downloads** that sets what guests get when they download a photo, either
singly or as a ZIP:

- **Reduced** (`preview`): the preview image Immich generates, by default a JPEG of 1440 px on the long side and
  usually well under 1 MB. Size and quality are set in Immich under *Administration → Settings → Image Settings →
  Preview*. After changing them, rerun the thumbnail job for all assets under *Jobs*.
- **Original** (`original`): the uploaded file in full resolution.

Videos are always served as the original file. Whether guests may download at all is still set per share in Immich
(*Allow download*).

The choice is stored in `settings.json` in `DATA_DIR`. It takes effect immediately and overrides
`ipp.maxDownloadQuality` from `config.json`. As long as nothing has been saved on the admin page, `config.json`
applies.

Branding set on the admin page is stored in `DATA_DIR/branding/` (texts in `branding.json`, colors in `colors.json`,
plus the uploaded images). The newsletter settings (on/off, position, band at the end, bar) are stored in `settings.json` as well.

## Newsletter

With [e-mail](#e-mail-optional) set up, the *Newsletter* tab on the admin page can show a sign-up form in every
album. It sits as a band between the photo rows, after the row with photo number *N* (default 12, about three rows
on a computer and four on a phone); albums with fewer photos show it at the end. Guests enter their e-mail address
and, optionally, their first name.

Two options help guests who scroll past it:

- **Also after the last photo**: the same band once more at the end of the album. It is left out when the first
  band already sits at the end.
- **Bar at the bottom of the screen**: a slim bar that appears once the guest has scrolled half a screen and no band
  is in view. Its button opens the form in a dialog. Guests can close it (it then stays away for 14 days, remembered
  in the browser's local storage), and it disappears after a sign-up.

A sign-up in one place turns every form on the page into the "sent" note.

The sign-up uses double opt-in:

1. The portal sends a confirmation e-mail (text and HTML) with a link to `/newsletter/<token>`. The token carries the
   address, name, album title and time, signed with a key derived from `PORTAL_SECRET`, and is valid for 14 days.
   Nothing about the token is stored.
2. Opening the link only asks the question; mail programs and virus scanners open links on their own. The guest
   confirms with the button on that page. Changed or older links show "Link expired".
3. The confirmed address is stored with time and IP as proof, and `NEWSLETTER_NOTIFY` gets an e-mail with the guest
   as reply-to.

The portal does not add anyone to a newsletter tool itself. The *Newsletter* tab lists new confirmed addresses:
copy them or download a CSV (semicolon-separated, UTF-8 with BOM for Excel), add them to your newsletter tool, then
mark them as added. The admin overview reminds you while new ones are waiting.

The list is `newsletter.json` in `DATA_DIR`. An address is stored only after its confirmation e-mail went out; an
unconfirmed one expires after 30 days. Limits: 4 e-mails per address and 20 per IP per hour, 400 per day in total;
30 confirmations per IP in 10 minutes.

For scripts, the admin server offers a JSON API (POST requests need the `X-CSRF-Token` header):
`GET /api/newsletter`, `POST /api/newsletter/uebertragen` (`{ "mails": [...], "an": true }`),
`POST /api/newsletter/loeschen` (`{ "mail": "..." }`), `GET /api/newsletter.csv` (`?neu=1` new only, `?alle=1` also
unconfirmed) and `POST /api/mail/test`.

## Statistics

The *Statistics* tab on the admin page shows visitors and downloads per day, for all shares or a single one, over the
last 30 or 90 days or since counting began (longer periods are shown per week). Tiles compare the last 7 days with
the 7 days before, and a table lists every share with its visitors, downloads and last visit. Shares that are still
online but have had no visitor for 14 days are marked, so you know when a link can go.

What is counted:

- **Visitors**: a guest who opens a gallery counts once per day and share, however often they reload.
- **Page views**: every gallery page load.
- **Downloads**: downloaded files, a single download as well as every file in a ZIP; ZIP downloads are also counted
  on their own.
- **Logins**: with the password (landing page or password page) and through a QR code / access link.

Link previews (WhatsApp, Telegram, …), crawlers and requests without a browser user agent are left out. Only daily
totals per share are stored, in `stats.json` in `DATA_DIR` (written at most every 30 seconds and on shutdown). No IP
addresses, user agents or cookies are stored: visitors are told apart with a salted hash that exists only in memory
and whose salt changes every day. Statistics of shares that were deleted in Immich stay until you delete them on
the statistics page.

## Data folder

The compose file mounts the named volume `eg-portal-data` at `/app/data`. It is writable although the container's
filesystem is read-only, and it inherits its ownership from the image, so no `chown` is needed. If you use a bind
mount instead, the folder must be writable for UID 1000 (`node`). If the folder is not writable, the admin page shows
a warning: the download setting and the statistics then only last until the next restart, and branding cannot be
saved at all.

## `config.json`

### Portal settings

| Key | Default | Purpose |
|---|---|---|
| `portal.defaultLanguage` | `en` | Language when the browser asks for neither English nor German (`en` or `de`) |
| `portal.sessionDays` | `14` | How long a guest stays logged in after entering the password |
| `portal.sourceUrl` | this repository | See [Branding](#branding) |

### Languages

The guest pages, the gallery and the admin page are available in English and German. The language is chosen in this
order:

1. The language switcher (EN | DE) at the top of every page. The choice is stored in the cookie `lang` for a year.
2. The browser's preferred language (`Accept-Language`).
3. `portal.defaultLanguage`.

Album titles and descriptions come from Immich and are shown as they are.

### Gallery settings (inherited)

The `ipp` block is the configuration of the upstream project. Every option is documented at
[docs.ipp.nz](https://docs.ipp.nz/config/). This fork ships with these deliberate choices:

| Key | Value here | Why |
|---|---|---|
| `allowSlugLinks` | `false` | Custom slugs (`/s/…`) are guessable; the routes are refused entirely |
| `showHomePage` | `false` | The portal's landing page replaces the upstream home page |
| `showMetadata.*` | all `false` | Guests see no EXIF, location or file details |
| `responseHeaders.Cache-Control` | `private, …` | Albums are private, so shared caches must not store them |
| `gallery.expiryDateFormat` | not set | The date follows the page language (`21 Nov 2026` / `21.11.2026`); setting it forces one format for both |

### Overriding the config

Mount your own file over `/app/config.json`, or pass the JSON in `CONFIG`:

```yaml
  portal:
    volumes:
      - ./config.json:/app/config.json:ro
```

The override **replaces** the built-in file completely and is not merged. Missing keys fall back to the code
defaults, which for inherited options are the upstream defaults. For example, `allowSlugLinks` defaults to `true`.
Start from a copy of [`app/config.json`](../app/config.json) and change only what you need.
