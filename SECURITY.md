# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/PottiMc/immich-event-gallery/security/advisories/new)
instead.

Include what an attacker can achieve, the steps to reproduce, and the affected version (image tag or commit). You will
get an answer as soon as possible. Fixes are released as a new image.

If the issue also affects the original [Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy) and
is not caused by this fork's additions, please report it there as well.

## Scope

In scope:

- The guest portal and the admin server (`app/`)
- The Docker image and `docker-compose.yml` as shipped

Out of scope:

- Immich itself (report to [Immich](https://github.com/immich-app/immich/security))
- Your reverse proxy and its authentication in front of the admin pages and Immich
- Weak passwords chosen by the operator

## Supported versions

Only the latest image (`latest` and the most recent version tag) receives fixes.
