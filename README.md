# Immich Event Gallery

A password-protected photo portal for event guests, built on [Immich](https://immich.app) and forked from
[Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy).

It was built for small businesses that run events such as wine tastings or guided hikes. After an event, guests
enter the password they were given (or scan a QR code) and land directly in *their* album. The source is published
under the AGPL-3.0, and you are welcome to adapt it for your own events.

> The interface is available in **English** (default) and **German**, with a language switcher on every page. Code,
> comments and documentation are in English. The repository
> contains no brand logos or company details: out of the box the portal is neutral, and your own branding comes from
> a folder on your server (see [Adapting it](#adapting-it)).

> [!NOTE]
> **Vibe-coded.** Everything this fork adds to Immich Public Proxy was written entirely by
> [Claude](https://claude.ai), Anthropic's AI assistant, under the direction of the repository owner. That includes the
> portal code, tests, Docker setup and documentation. The code has unit tests and went through an AI-led security
> review, but it has not been audited by an independent human. Read the code before you trust it with private photos,
> and please [report](SECURITY.md) anything you find.

## How it works

```
Guest ── password or QR code ──▶ Portal ── API key (sharedLink.read) ──▶ Immich
                                   │        lists all password-protected shares,
                                   │        finds the one that matches
                                   └──────▶ serves that album (read-only)
```

The operator manages everything in Immich: create an album, then create a shared link with a password and an expiry
date. There is no second configuration step. As soon as the link exists, the album can be reached through the portal.
When the link expires or is deleted, the album goes offline.

## Features

- **Landing page with a single password field.** The password decides which album opens. Case, spaces, `-`, `_` and
  `.` are ignored when comparing.
- **English and German.** The language follows the browser, can be switched on every page (EN | DE) and is
  remembered in a cookie.
- **QR codes and direct links** per album. Guests can pass them on to each other ("Share album" dialog).
- **Share to WhatsApp & co.** The photo itself goes out through the phone's native share sheet (Web Share API), with a
  text like *"That was the wine hike – photo 12 of 48"*. On desktop it falls back to
  WhatsApp Web.
- **Removal requests.** Guests can select photos and ask for them to be removed for privacy reasons. They have to
  pick a privacy reason, explain it and leave their name and e-mail address; the request is e-mailed to you
  (optional, needs SMTP).
- **Brute-force protection.** Per-IP lockout with growing duration, a global cap, and an artificial delay on every
  wrong attempt.
- **Admin pages** on a separate port: all shares as a compact list with their passwords and warnings (weak, duplicate,
  missing password, no expiry), QR codes as PNG/SVG, printable cards (four per A4 sheet with crop marks, or A6) and password suggestions. Guest downloads
  can be switched between the original files and smaller preview images there, and a *Branding* tab sets the name,
  links, share texts, logos and icons without touching any files.
- **No third parties.** Fonts are self-hosted, and there are no trackers, no external requests and no Google Fonts.
  The pages are hidden from search engines.
- Everything the upstream gallery offers: justified-rows layout, PhotoSwipe lightbox, videos and motion photos,
  single and ZIP downloads.

## Getting started

The repository ships a complete Docker Compose stack: a dedicated Immich instance (server, machine learning, Postgres,
Valkey) plus the portal.

```bash
cp .env.example .env        # fill in the values
docker compose up -d
```

The full walkthrough covers the reverse proxy, Immich setup, the API key and the first album:
**[docs/deployment.md](docs/deployment.md)**.

All settings are listed in **[docs/configuration.md](docs/configuration.md)**.

The image is built by GitHub Actions and published as `ghcr.io/pottimc/immich-event-gallery` (`latest`, short commit
SHA, and semver tags) for `linux/amd64` and `linux/arm64`.

## Security

The portal is the only public component. Immich and the admin pages must stay behind authentication.

- **Least privilege towards Immich:** the API key only needs `sharedLink.read`. The portal never writes to Immich.
- **Lockout:** 5 wrong passwords per IP within 15 minutes block that IP for 15 minutes. Each further block doubles the
  duration, up to 24 hours. IPv6 clients are counted per /64. More than 100 failures from anywhere within 15 minutes
  pause password entry for everyone for 5 minutes. QR links keep working because their tokens are not guessable.
- **Every password entry point is throttled**, including the unlock form of a direct album link.
- **QR tokens** are an HMAC of the share key and its password. Changing the password in Immich invalidates old QR
  codes immediately and ends existing guest sessions within about two minutes.
- **Strict headers:** a Content Security Policy without inline scripts, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy: same-origin` (share keys are part of the URL), and HSTS over HTTPS.
- **Hardened container:** read-only filesystem, all capabilities dropped, `no-new-privileges`, memory and PID limits.
  The portal sits on its own network and can only reach the Immich server.
- Invalid, expired or failed requests return a plain 404 and reveal nothing about Immich.

Rate-limit state is held in memory, so it resets when the container restarts. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## Adapting it

The fork keeps its additions separate from the upstream code so that upstream updates can still be merged:

| Path | Contents |
|---|---|
| `app/src/portal/` | Portal logic: password matching, QR tokens, lockout, security headers, admin server, pages |
| `app/src/client/portal.ts` | Share button in the lightbox and the "share album" dialog |
| `app/src/portal/branding.ts` | Loads the operator's branding folder |
| `app/public/portal/` | Stylesheets and the small scripts required by the CSP |
| `app/public/brand/` | Neutral default logos and icons |

To run it for your own events, set your name, links, share texts, logos and icons on the admin page (tab
*Branding*), or put them as files into the branding folder on your server. The [branding section](docs/configuration.md#branding) lists the
files; no code changes or image rebuilds are needed. The interface texts in both languages live in
`app/src/portal/i18n.tsx` (pages) and `app/src/shared/i18n.ts` (gallery scripts), and the colours in
`app/public/portal/*.css`. If you change the code, point `sourceUrl` at your own public repository, because the
AGPL requires you to offer the source of the version you run.

## Development

```bash
cd app
npm ci
npm run dev        # server + client watchers, reads app/.env
npm run build
npm test           # vitest
npx eslint src/
```

`app/.env` needs at least `IMMICH_URL`, `IMMICH_API_KEY`, `PORTAL_SECRET` and `PUBLIC_BASE_URL`, and optionally
`PORTAL_ADMIN_PASSWORD` to enable the admin server on port 3001. See [CONTRIBUTING.md](CONTRIBUTING.md) for
conventions and for how upstream changes are merged.

## Credits and license

Based on [Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy) by Alan Grainger, whose
[documentation](https://docs.ipp.nz) still applies to every inherited option. Fonts:
[Outfit](app/public/fonts/Outfit-LICENSE.txt) and [Inter](app/public/fonts/Inter-LICENSE.txt) (SIL Open Font License).

Licensed under the [GNU Affero General Public License v3.0](LICENSE), like the original.
