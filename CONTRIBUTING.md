# Contributing

This repository is a site-specific fork of [Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy)
(IPP), maintained for one business. Bug reports and security fixes are very welcome. Larger features are best
discussed in an issue first.

If a change would benefit every IPP user, such as gallery, lightbox or streaming changes that have nothing to do with
the password portal, please propose it [upstream](https://github.com/alangrainger/immich-public-proxy) instead. It
will then arrive here with the next merge.

## Ground rules

The upstream [CONTRIBUTING guide](https://github.com/alangrainger/immich-public-proxy/blob/main/CONTRIBUTING.md)
applies: keep the code small enough to audit, return a plain 404 for anything invalid, escape everything that comes
from Immich, use no client framework or bundler, and write no speculative caches or shims. This fork deviates from it
deliberately in the following ways:

- **API key:** the portal uses an Immich API key to find the share that matches a password. The key must never need
  more than `sharedLink.read`, and the portal must never write to Immich.
- **In-memory state:** the lockout keeps failed attempts in memory. It must stay bounded, and nothing is persisted.
- **English and German UI, English code:** every text that guests and the operator see exists in both languages, in
  `app/src/portal/i18n.tsx` (pages) and `app/src/shared/i18n.ts` (gallery scripts). Never hard-code UI text in a
  view or script. Code, comments, commit messages and documentation are English.

Also:

- **Stay merge-friendly.** New logic belongs in `app/src/portal/`, `app/src/client/portal.ts` and
  `app/public/portal/`. Keep edits to upstream files small and obvious.
- **Keep the CSP intact.** Do not use inline scripts or inline event handlers. Put scripts in files under
  `app/public/portal/`.
- **Throttle every password entry point.** Any new way to submit a password must go through the same lockout.
- **Documentation:** update `docs/configuration.md` when you add a setting, and `docs/deployment.md` when the setup
  changes.

## Development

```bash
cd app
npm ci
npm run dev        # server and client watchers
npm run build
npm test
npx eslint src/
```

Create `app/.env` with `IMMICH_URL`, `IMMICH_API_KEY`, `PORTAL_SECRET` (at least 32 characters) and
`PUBLIC_BASE_URL`. Add `PORTAL_ADMIN_PASSWORD` to enable the admin server on port 3001. A separate test instance of
Immich with a few password-protected shares is the easiest way to exercise the full flow.

Add unit tests to `app/tests/` for new pure logic, and run the build, tests and lint before opening a pull request. CI
runs the same checks.

## Merging upstream

```bash
git remote add upstream https://github.com/alangrainger/immich-public-proxy.git   # once
git fetch upstream
git merge upstream/main
```

This fork removed or replaced some upstream files: the VitePress `docs/` site, the feature-request issue template,
and the root compose file, which is now the full stack. If
upstream changes one of them, git reports a modify/delete conflict. Keep the deletion with `git rm <path>` and check
whether the upstream change needs an equivalent here. After every merge, run the tests, and compare
`docker-compose.yml` with the current Immich compose template.

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
