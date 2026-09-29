# Deployment

This guide sets up the complete stack from scratch: a dedicated Immich instance for event photos and the public guest
portal in front of it. Setup takes about an hour, most of which is spent on the reverse proxy.

## Overview

```
Guest (phone)                                    Operator
     │                                               │
     ▼                                               ▼
photos.example.com                   photos-admin.example.com   immich.example.com
(public, no login)                   (behind authentication)     (behind authentication)
     │                                               │                  │
     └──────────────── reverse proxy / tunnel ───────┴──────────────────┘
                                   │
            Docker host (stack from docker-compose.yml)
   ┌────────────────────────────────────────────────────────────────────┐
   │ eg_portal   :3100 → guest portal   :3101 → admin pages      │
   │        │ (reads shared links with a read-only API key)             │
   │ eg_immich_server   :2284 → Immich web UI (upload, albums, shares)  │
   │ eg_immich_machine_learning · eg_immich_postgres · eg_immich_redis  │
   └────────────────────────────────────────────────────────────────────┘
```

| Component | Host port | Exposure |
|---|---|---|
| Guest portal | 3100 | **Public**, no authentication |
| Admin pages (QR codes, cards, passwords) | 3101 | Behind reverse-proxy authentication, plus the admin password |
| Immich web UI | 2284 | Behind reverse-proxy authentication, plus the Immich login |

Immich is only for you. Guests never reach it directly. The portal only shows albums that you shared in Immich with a
link and a password. The stack is fully separate from any other Immich you may already run: its container names
start with `eg_`, and it uses its own folders and different ports.

## Requirements

- A Linux host with Docker and Docker Compose v2, or Portainer. `linux/amd64` and `linux/arm64` are supported.
- About 3 GB of free RAM with machine learning enabled, or about 1 GB without it.
- A reverse proxy with HTTPS that can put authentication in front of individual hosts. Examples are Pangolin with SSO,
  Traefik or Caddy with Authelia or Authentik, and Cloudflare Tunnel with Access.
- A domain or subdomain for the guest portal and two more for the admin pages and Immich.

## 1. Create the data folders

```bash
sudo mkdir -p /opt/immich-event-gallery/library /opt/immich-event-gallery/postgres /opt/immich-event-gallery/branding
```

- `library` holds photos, videos and Immich's daily database dumps. It can grow large, so put it on your big disk.
- `postgres` holds the database. Put it on a **local disk**, ideally an SSD, and **never on a network share**.
- `branding` (optional) holds your logos, icons and `branding.json`. See [Branding](configuration.md#branding). If you
  leave it empty, the portal uses its neutral defaults.

If you use different paths, set them in the next step.

## 2. Configure and start the stack

Copy [`.env.example`](../.env.example) to `.env` next to `docker-compose.yml` and fill it in:

```bash
cp .env.example .env
openssl rand -hex 32   # run once each for DB_PASSWORD, PORTAL_SECRET and PORTAL_ADMIN_PASSWORD
```

- `PUBLIC_BASE_URL`: the public address of the guest portal, for example `https://photos.example.com`. QR codes point
  there.
- `PORTAL_SECRET`: **never change it after going live.** Printed QR codes and guest sessions are derived from it.
- `IMMICH_API_KEY`: leave it empty for now. You will create it in step 4.
- Keep `.env` safe. It is gitignored and is the one file you need to restore the portal.

Then start the stack:

```bash
docker compose up -d
docker compose ps       # all five containers should come up
```

**With Portainer:** go to *Stacks → Add stack → Web editor*, paste `docker-compose.yml`, and paste your `.env` under
*Environment variables → Advanced mode*. Then choose *Deploy the stack*. If the image is private, for example while
the repository is private, add `ghcr.io` under *Registries* with a GitHub token that has the `read:packages`
permission.

The first start takes a while because images are pulled and the database is initialised. Until step 4, the admin page
reports that `IMMICH_API_KEY` is not set, and no password matches. That is expected.

### Restrict the ports

By default (`BIND_IP=0.0.0.0`) all three ports are reachable from your whole LAN, including the admin pages, which
there are protected only by the admin password. Bind them to where your reverse proxy or tunnel actually connects
from:

| Where does the reverse proxy / tunnel client run? | What to do |
|---|---|
| On the same host, or as a container with `network_mode: host` | `BIND_IP=127.0.0.1` and targets `127.0.0.1:3100` etc. |
| As a container on a Docker bridge network | Attach it to the stack's network (see below) and remove the `ports:` entries |
| On another machine | Keep the LAN IP and restrict access with a host firewall |

To attach a proxy container to the stack's network, add the network `<stack-name>_eg-portal` to your proxy's compose
file (declared as `external: true`). Then use `eg_portal:3000`, `eg_portal:3001` and
`eg_immich_server:2283` as targets. No host ports are needed at all.

## 3. Configure the reverse proxy

Create three HTTP routes:

| Route | Example host | Target | Authentication |
|---|---|---|---|
| Guest portal | `photos.example.com` | `<host>:3100` | **None**, it must be public |
| Admin pages | `photos-admin.example.com` | `<host>:3101` | **Required** (SSO or similar) |
| Immich | `immich.example.com` | `<host>:2284` | **Required** (SSO or similar) |

Choose unguessable or at least unadvertised names for the admin hosts, and never make them public.

### Check that the real visitor IP arrives

The lockout counts failed attempts per client IP. If the portal only sees the proxy's IP, all guests share one counter,
and one guest with typos locks everyone out. To check:

1. On a phone **on mobile data** (Wi-Fi off), enter a wrong password on the landing page.
2. Look at the portal logs (`docker logs eg_portal`). The line `Portal: wrong password from …` must show the
   phone's **public** IP, or its IPv6 /64.
3. If it shows a private address (`172.…`, `10.…`, `192.168.…`), the proxy chain does not forward it. Make sure your
   proxy sets `X-Forwarded-For`, and adjust [`TRUST_PROXY`](configuration.md#environment-variables) if the proxy
   connects from a non-private address.

If the domain is proxied by Cloudflare (orange cloud), the portal sees Cloudflare's IPs. Either switch the record to
"DNS only", or make your reverse proxy restore the client IP from `CF-Connecting-IP` before it reaches the portal.

### Optional extra protection

- Use a CrowdSec or fail2ban integration on the reverse proxy to block known scanners before they reach the portal.
- If your guests come from a known region, allow only those countries on the guest route.
- The CPU limits in `.env` (`PORTAL_CPUS`, `IMMICH_CPUS`, `ML_CPUS`) keep the stack from taking the whole host under
  load. Check the number of cores with `nproc` and never set more.

## 4. Set up Immich

1. Open the Immich host, choose **Getting started**, and create the admin account.
2. **Machine learning** (faces, smart search, duplicates) works without further setup. Its URL under
   *Administration → Settings → Machine Learning* is `http://immich-machine-learning:3003`. The first uploads are slow
   while the models (~1 GB) download. If the host is short on memory, disable machine learning there and remove the
   `immich-machine-learning` service from the compose file.
3. Under *Administration → Settings → Server*, set the **External domain** to your `PUBLIC_BASE_URL` so that share
   links copied from Immich point at the portal.
4. **Create the API key for the portal:** go to *Account settings → API keys → New API key*, name it
   `Photo portal`, and select **only** the `sharedLink.read` permission. Copy the key, because Immich shows it only
   once.
5. Put it into `.env` as `IMMICH_API_KEY=…` and run `docker compose up -d` again (Portainer: *Update the stack*).
6. Open the admin host. The browser asks for credentials: any username, with `PORTAL_ADMIN_PASSWORD` as the password.
   It should say that there are no shares yet, and show **no** red error.

## 5. Publish the first album

1. In Immich, create an album and upload photos. Whole folders can be dragged into the browser. The album name is the
   title guests see.
2. In the album, choose **Share → Create link**:
   - Set a **password**. The admin page suggests some at the bottom, for example `riesling-karaffe-4827`.
   - Set an **expiry date**, for example 60 days. After that, the album goes offline automatically.
   - Turn on *Allow download* if guests may download originals and ZIPs.
   - Leave *Show metadata* off.
3. Reload the admin page. The album appears with its password, QR code and a printable card.
4. Open `PUBLIC_BASE_URL` on a phone and enter the password. You should land in the album.

## Day-to-day use

Putting a new event online takes three steps: create the album, upload the photos, and create a share link with a
password and an expiry date. Then hand out the access in one of these ways:

- **Printed card:** light or dark, created on the admin page, with an editable title and date. By default four cards
  come on one A4 sheet with crop marks (print at 100 % or save as PDF, cut size 94 × 132.5 mm); a single A6 card is
  available too.
- **QR code** as PNG or SVG for emails and invoices.
- **The password itself**, sent by message.

**Custom share text per album.** Add a line starting with `Share:` (English guests) and/or `Teilen:` (German
guests) to the Immich album description:

```
Share: That was the wine hike on the Saar with Weingut Beispiel 🍷 – photo {number} of {total}
Teilen: Das war die Weinwanderung an der Saar mit dem Weingut Beispiel 🍷 – Bild {nr} von {anzahl}
```

If only one of the lines is there, it is used for both languages. Guests do not see these lines. The rest of the description is shown above the photos. Without it, the default text from
[`portal.shareText`](configuration.md#portal-settings) is used.

**What guests can do:**

- Open a photo, tap the share icon, and send the photo itself to WhatsApp or other apps, together with the text.
- "Share album" shows a QR code for other guests to scan, or shares or copies the link.
- Switch between English and German at the top of every page.
- Download single photos, a selection (long press) or everything as a ZIP, if the share allows downloads.
- Stay logged in for 14 days (`portal.sessionDays`).
- Ask for photos to be removed for privacy reasons ("Remove photos"), if [removal requests](configuration.md#removal-requests-optional)
  are set up. You get an e-mail and remove the photos in Immich yourself.

**Good practice:**

- Always set a password on guest shares. A share *without* a password cannot be reached through the password field,
  but anyone with its link or QR code can open it.
- Use the suggested passwords (word-word-number). The admin page flags short or reused passwords, missing passwords
  and shares without an expiry date.
- To revoke access, change the password in Immich or delete the share. Old QR codes and direct links stop working at
  once.

## Updates

- **Portal:** pull the new image and recreate the container with `docker compose pull portal && docker compose
  up -d`. In Portainer, use *Update the stack* with *Re-pull image*. For reproducible deployments, pin `PORTAL_IMAGE`
  to a version or SHA tag instead of `latest`.
- **Immich:** `IMMICH_VERSION=v3` follows the latest v3 release whenever you re-pull. Read the
  [release notes](https://github.com/immich-app/immich/releases) first, or pin a version such as `v3.2.2`. When Immich
  publishes a new compose template, compare its database and Valkey image digests with the ones in this stack.

## Backup

- Back up the `UPLOAD_LOCATION` folder. Immich writes a daily database dump to `backups/` inside it, so this folder
  contains everything.
- Do not copy the `postgres` folder while the stack is running. The dumps exist for that purpose.
- Keep a copy of `.env`, above all `PORTAL_SECRET`. Without it, all printed QR codes stop working.
- The `eg-portal-data` volume only holds the settings saved on the admin page. It needs no backup; if it is lost, set
  them again there.

## Privacy notes

This section is written for operators in the EU and is not legal advice.

- Tell guests at booking or at the event that photos will be taken and shared in a password-protected online album,
  and let them object. Removing a photo in Immich removes it from the portal. With
  [removal requests](configuration.md#removal-requests-optional) set up, guests can object right from the album.
- Mention the portal in your privacy policy: its purpose, the retention period (the share's expiry date), self-hosting
  and the session cookie.
- The portal sets a single, technically necessary session cookie. It loads no external fonts, scripts or trackers, and
  it asks search engines not to index it.
- EXIF data such as location and camera is not shown to guests, but it is still contained in downloaded originals. If
  that matters, disable *Allow download* or strip GPS data before uploading.

## Troubleshooting

| Problem | Fix |
|---|---|
| Admin page: "Immich lehnt den API-Key ab" | Create a new key with `sharedLink.read`, put it in `.env`, and recreate the portal container |
| Admin page: "Immich ist nicht erreichbar" | Is `eg_immich_server` running? `IMMICH_URL` must be `http://immich-server:2283` |
| A password is not found | Does the share have a password? Has it expired? The admin page shows both |
| A guest sees "ein paar Versuche zu viel" | The lockout expires by itself. Restarting `eg_portal` clears it at once |
| All guests are locked out at once | The real visitor IP does not arrive; see [step 3](#check-that-the-real-visitor-ip-arrives) |
| QR codes point to the wrong address | Check `PUBLIC_BASE_URL` |
| All guests logged out, QR codes invalid | `PORTAL_SECRET` changed or is missing. Restore the old value |
| Immich mobile app cannot log in | Apps usually cannot pass reverse-proxy SSO. Use the LAN address (`http://<host>:2284`) or the browser |
| Faces or smart search do not work | Is `eg_immich_machine_learning` running? Check its logs. The first run downloads models |
| Logs | `docker logs eg_portal` shows logins, failed attempts and lockouts |
