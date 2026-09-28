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
| `PORTAL_ADMIN_PASSWORD` | no | – | Enables the admin server (HTTP Basic Auth; any username). Without it, the admin server does not start. |
| `PORTAL_ADMIN_PORT` | no | `3001` | Port of the admin server **inside** the container. |
| `TRUST_PROXY` | no | private networks | Express [`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html) setting: `true`, `false`, a hop count, or a comma-separated list of addresses or subnets. The default is `loopback, linklocal, uniquelocal`. Only trusted proxies may set the client IP that the lockout counts. |
| `IPP_PORT` | no | `3000` | Port of the guest portal inside the container. |
| `IPP_CONFIG` | no | `/app/config.json` | Path to an alternative config file. |
| `CONFIG` | no | – | The complete config as an inline JSON string. When set, no file is read. |
| `BRANDING_DIR` | no | `/app/branding` | Branding folder inside the container, see [Branding](#branding). |
| `DATA_DIR` | no | `/app/data` | Writable folder for the settings saved on the admin page, see [Admin settings](#admin-settings). |
| `TZ` | no | `Europe/Berlin` | Time zone for logs and dates. |

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
| `PORTAL_IMAGE` | `ghcr.io/pottimc/immich-event-gallery:latest` | Portal image. Pin a version or SHA tag for reproducible deployments. |

## Branding

Without a branding folder the portal is neutral: it is called "Bilder-Portal", shows a generic picture icon, and hides
the website, imprint and privacy links. Your own brand lives in a folder on the server (`BRANDING_LOCATION`), which is
mounted read-only at `/app/branding`. Nothing in it ends up in the repository or the image, so nobody who pulls the
project gets your logos.

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
| `branding.json` | – | Brand texts, see below. It is never served to visitors. |

`branding.json`:

```json
{
  "brandName": "Weingut Beispiel",
  "websiteUrl": "https://weingut.example",
  "imprintUrl": "https://weingut.example/impressum",
  "privacyUrl": "https://weingut.example/datenschutz",
  "shareText": "Das war „{titel}“ mit dem Weingut Beispiel 🍷 – Bild {nr} von {anzahl}",
  "shareUrl": "https://weingut.example"
}
```

| Key | Default | Purpose |
|---|---|---|
| `brandName` | `Bilder-Portal` | Name in page titles, image alt texts and link previews |
| `websiteUrl` | empty (hidden) | Website link in the footer |
| `imprintUrl` | empty (hidden) | Imprint link in the footer. In Germany an imprint is mandatory. |
| `privacyUrl` | empty (hidden) | Privacy policy link in the footer |
| `shareText` | `Das war „{titel}“ – Bild {nr} von {anzahl}` | Default text when a guest shares a photo |
| `shareUrl` | `websiteUrl` | Link appended to shared photos (your website, not the album). Empty = no link. |
| `sourceUrl` | this repository | Source code link on the licence page (`/lizenz`, linked as "Lizenz" in the footer). The AGPL requires it to point to the source of the version you run. |

The share text placeholders are `{titel}` (album title), `{nr}` (photo number) and `{anzahl}` (total number of
photos). A single album can override the text with a line `Teilen: …` in its Immich album description. The portal
hides that line from guests.

The same keys are also read from the `portal` block of `config.json`, with `branding.json` taking precedence.
Texts are read once at startup, so restart the container after changing `branding.json`. Images are picked up
immediately; browsers cache them for a day.

For local development, put the folder at `app/branding/`, which is gitignored.

## Admin settings

The admin page has a section **Download für Gäste** that sets what guests get when they download a photo, either
singly or as a ZIP:

- **Verkleinert** (`preview`): the preview image Immich generates, by default a JPEG of 1440 px on the long side and
  usually well under 1 MB. Size and quality are set in Immich under *Administration → Settings → Image Settings →
  Preview*. After changing them, rerun the thumbnail job for all assets under *Jobs*.
- **Original** (`original`): the uploaded file in full resolution.

Videos are always served as the original file. Whether guests may download at all is still set per share in Immich
(*Allow download*).

The choice is stored in `settings.json` in `DATA_DIR`. It takes effect immediately and overrides
`ipp.maxDownloadQuality` from `config.json`. As long as nothing has been saved on the admin page, `config.json`
applies.

The compose file mounts the named volume `eg-portal-data` at `/app/data`. It is writable although the container's
filesystem is read-only, and it inherits its ownership from the image, so no `chown` is needed. If you use a bind
mount instead, the folder must be writable for UID 1000 (`node`). If the folder is not writable, the admin page shows
a warning and a change only lasts until the next restart.

## `config.json`

### Portal settings

| Key | Default | Purpose |
|---|---|---|
| `portal.sessionDays` | `14` | How long a guest stays logged in after entering the password |
| `portal.sourceUrl` | this repository | See [Branding](#branding) |

### Gallery settings (inherited)

The `ipp` block is the configuration of the upstream project. Every option is documented at
[docs.ipp.nz](https://docs.ipp.nz/config/). This fork ships with these deliberate choices:

| Key | Value here | Why |
|---|---|---|
| `allowSlugLinks` | `false` | Custom slugs (`/s/…`) are guessable; the routes are refused entirely |
| `showHomePage` | `false` | The portal's landing page replaces the upstream home page |
| `showMetadata.*` | all `false` | Guests see no EXIF, location or file details |
| `responseHeaders.Cache-Control` | `private, …` | Albums are private, so shared caches must not store them |
| `gallery.expiryDateFormat` / `expiryDateLocale` | `DD.MM.YYYY` / `de` | German date format |

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
