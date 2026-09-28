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
- The admin server runs on port 3001 with Basic Auth (`PORTAL_ADMIN_PASSWORD`). It provides the share overview, QR
  codes as PNG/SVG, printable A6 cards and password suggestions.
- Slug links (`/s/…`) are refused everywhere because they are guessable.

## Layout

- `app/src/portal/`: all portal logic (settings, links, tokens, throttle, security headers, routes, gallery
  extras, views, admin)
- `app/src/client/portal.ts`: share button (Web Share API with the image file, prefetched for Safari; wa.me
  fallback) and the "share album" dialog
- `app/src/portal/runtime-settings.ts`: settings saved on the admin page (`DATA_DIR/settings.json`, a writable
  volume), laid over the loaded config at startup and on save. Currently only the guest download quality
- `app/src/portal/i18n.tsx`: all page texts in English and German, and the language choice per request
  (`?lang=` switcher → cookie `lang` → `Accept-Language` → `portal.defaultLanguage`)
- `app/src/portal/branding.ts`: operator branding from `BRANDING_DIR` (logos, icons, `branding.json`), falling
  back to the neutral assets in `app/public/brand/`. Real brand assets must **never** be committed; locally they live in
  the gitignored `app/branding/`
- `app/public/portal/`: CSS and the external scripts required by the CSP (`unlock.js`, `admin.js`, `card.js`)
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
