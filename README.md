# Forum Reader

A mobile-friendly **PWA** for reading phpBB / vBulletin forums that have the
**Tapatalk (mobiquo) plugin** — browse categories and topics, read posts with
inline images and YouTube, and send/receive private messages. A free,
open alternative to the Tapatalk app.

Built with React + TypeScript + Vite + Tailwind, stored locally with Dexie
(IndexedDB), installable and offline-capable via `vite-plugin-pwa`, and deployed
to GitHub Pages.

## How it works (and why you need a tiny relay)

Forum Reader is a **static front-end** with no backend. Browsers block a static
site from reading cross-origin forum responses or managing forum login cookies
(CORS), so the app talks to your forums through a **small relay you host
yourself** (a free Cloudflare Worker or Deno Deploy project). Your forum traffic
and credentials only ever pass through infrastructure **you** control.

```
PWA (GitHub Pages) ──▶ your relay ──▶ forum /mobiquo/mobiquo.php (Tapatalk API)
```

See [`proxy/README.md`](./proxy/README.md) for the ~5-minute one-time relay
setup, then paste the relay URL + token into the app's **Settings → Relay**.

## Security

- Forum passwords are **AES-GCM encrypted** on your device (Web Crypto). The
  key is stored on the device too and loaded automatically at startup — no
  unlock prompt, the same trust model as Tapatalk's saved logins.
- Browser origin isolation prevents other sites/apps from reading the app's
  storage; anyone with access to this browser profile can use the saved logins.
- Vaults created by older versions (biometric/passphrase lock) ask for one
  final unlock, then convert to prompt-free startup.

## Features

- Multiple forum accounts; set a **favorite** that opens on launch.
- Categories → topics → thread browsing with pagination and **reply**.
- **Private messages**: folders, read, reply, compose.
- Posts render images and **click-to-load YouTube** embeds; HTML is sanitized
  with DOMPurify. Toggle media in Settings.
- **Dark / light / system** theme + accent color.
- Read/unread state is left to the forum (the source of truth), as requested.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the built app
```

> This project pins TypeScript to the 5.6 line: TS ≥ 5.7 made `Uint8Array`
> generic, which breaks the Web Crypto `BufferSource` calls in the vault.

## Deploy (GitHub Pages)

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds with the
correct `VITE_BASE` (the repo subpath) and publishes `dist/` to Pages. Enable
Pages → "GitHub Actions" in the repo settings once.

## Caveats

- A forum must have the **Tapatalk plugin** installed; the Add-Forum flow probes
  `/mobiquo/mobiquo.php` and reports clearly when it's missing.
- vBulletin (which also has a mobiquo build) isn't wired up yet — the client
  abstraction is designed so it can be added without touching the UI.
