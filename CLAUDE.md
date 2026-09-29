# CLAUDE.md

Guidance for AI coding agents working in this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) as well, because its
rules apply to you too. Personal, machine-specific notes may exist in `CLAUDE.local.md`, which is gitignored and must
never be committed.

## What this is

A password-based photo portal for event guests: a fork of Immich Public Proxy (IPP) v3.4.0 with a branded landing page
where the password decides which Immich album opens. The portal reads all shared links through an Immich API key with
only `sharedLink.read` permission (Immich returns share passwords in plain text) and matches the entered password in
normalised form: case, spaces, `-`, `_` and `.` are ignored. Nothing is configured twice. A password-protected share in
Immich is automatically online.

- QR and direct links use `/z/<token>`, where the token is HMAC(`PORTAL_SECRET`, share key + password). Changing the
  password invalidates the token.
- Lockout (in memory, `portal/throttle.ts`): 5 failures per IP (IPv6 per /64) within 15 minutes cause a
  15-minute block, doubling up to 24 hours. More than 100 failures in total within 15 minutes pause password entry
  for 5 minutes. Every failure also costs 600 ms. `/z/` is exempt from the global pause.
- `/share/unlock` validates the password itself and uses the same lockout. Upstream stored any password unchecked in
  the cookie.
- Share-key guard (`portal/key-guard.ts`) on every `/share/…` route that asks Immich about a key: keys in the cached
  link list pass; unknown keys whose request ends in 404 count, 20 per IP in 10 minutes or 300 in total pause
  unknown-key lookups (404 without an Immich call).
- The admin server runs on port 3001 behind a login form (`PORTAL_ADMIN_PASSWORD`, `portal/admin-auth.ts`: signed
  7-day session cookie; a Basic Auth header is still accepted for scripts; both share one lockout). It provides the
  share overview, QR codes as PNG/SVG, printable cards (`portal/card.ts`: four per A4 sheet with crop marks or single A6, title and date editable via
  `?titel=&datum=`), password suggestions and a branding page. Every admin POST
  goes through `validFormPost` in `portal/admin-forms.ts` (CSRF token as form field or `X-CSRF-Token` header, plus
  Sec-Fetch-Site).
- Slug links (`/s/…`) are refused everywhere because they are guessable.
- Removal requests (`portal/removal.ts`, `client/removal.ts`): with `SMTP_HOST` + `REMOVAL_REQUEST_TO` set, guests
  select photos and send a privacy reason, explanation, name and e-mail to `POST /share/:key/removal-request` (JSON,
  same-origin, unlocked share only). The operator gets an e-mail via nodemailer; nothing is written to Immich.
  3 requests per IP and hour, 30 in total, max 50 photos.

## Layout

- `app/src/portal/`: all portal logic (settings, links, tokens, throttle, security headers, routes, gallery
  extras, views, admin)
- `app/src/client/portal.ts`: share button (Web Share API with the image file, prefetched for Safari; wa.me
  fallback) and the "share album" dialog
- `app/src/portal/runtime-settings.ts`: settings saved on the admin page (`DATA_DIR/settings.json`, a writable
  volume), laid over the loaded config at startup and on save. Currently only the guest download quality
- `app/src/portal/stats.ts`: daily counters per share (visitors, page views, downloads, ZIPs, logins) in
  `DATA_DIR/stats.json`, recorded from `immich.ts` (gallery view, "download all"), `index.ts` (selective ZIP, single
  `/original` download) and `portal/routes.ts` (logins). Counts only: unique visitors via an in-memory hash with a
  daily salt, bots and link previews skipped. `admin-stats.ts` + `admin-stats-views.tsx` are the admin page for it
  (CSS bar charts, no chart library)
- `app/src/portal/i18n.tsx`: all page texts in English and German, and the language choice per request
  (`?lang=` switcher → cookie `lang` → `Accept-Language` → `portal.defaultLanguage`)
- `app/src/portal/branding.ts`: operator branding in three layers: set on the admin page (`DATA_DIR/branding/`),
  the branding folder (`BRANDING_DIR`: logos, icons, `branding.json`), the neutral assets in `app/public/brand/`.
  Link brand images with `brandUrl()` so a new upload is not hidden by the browser cache. Uploads are checked by their
  first bytes (PNG/JPEG/ICO only, never SVG). `admin-branding.ts` + `admin-branding-views.tsx` are the admin page for it. Real brand assets must **never** be committed; locally they live in
  the gitignored `app/branding/`
- `app/public/portal/`: CSS and the external scripts required by the CSP (`unlock.js`, `admin.js`, `card.js`,
  `branding.js`)
- Small, deliberate edits to upstream files: `index.ts`, `encrypt.ts`, `immich.ts`, `invalidRequestHandler.ts`,
  `gallery/builder.ts`, `view/gallery.tsx`, `share.ts` (per-language expiry date format), and the client texts
  (now read from `client/i18n.ts`)
- `docker-compose.yml` + `.env.example`: the full stack (Immich incl. machine learning, Postgres, Valkey, portal)
- `docs/deployment.md`, `docs/configuration.md`: user documentation

## Commands

```bash
cd app && npm ci && npm run build && npm test && npx eslint src/
npm run dev    # needs app/.env: IMMICH_URL, IMMICH_API_KEY, PORTAL_SECRET, PUBLIC_BASE_URL[, PORTAL_ADMIN_PASSWORD]
```

## Rules

- Guest- and operator-facing UI text exists in **English (default) and German**. Add every new text to both
  catalogues: `portal/i18n.tsx` for server-rendered pages, `shared/i18n.ts` for the gallery client; static scripts in
  `public/portal/` get their texts through `data-` attributes. Code, comments, docs and commit messages are
  **English**.
- Keep changes inside the `portal` paths where possible, so that `git merge upstream/main` stays easy.
- Never require more than `sharedLink.read` from Immich, and never write to Immich.
- The CSP is `script-src 'self'`: no inline scripts or event handlers.
- Every password entry point must go through the lockout.
- Invalid or failed requests return 404 and must not leak Immich details.
- Never commit secrets or brand assets: `.env`, `*.local.md` and `app/branding/` are gitignored.
- Tests must not depend on a local `app/branding/`; they set `BRANDING_DIR` to a non-existent folder.
- When testing locally, start servers with a unique marker (for example `node dist/index.js --eg-test-app`) and stop
  only processes carrying that marker. Never kill by a broad pattern such as `dist/index.js`, because it can hit
  unrelated Node processes.

## Known upstream quirk

`resolveShare` in `index.ts` checks `!share.link` before `passwordRequired`, so direct image URLs without a session
return 404 instead of redirecting to the password page. This is harmless and left as is.
