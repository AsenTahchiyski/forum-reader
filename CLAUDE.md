# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm run build      # tsc --noEmit + production build to dist/
npm run typecheck  # type check only
npm run preview    # serve the built app
```

There are no tests and no linter; `npm run typecheck` is the verification step.

**TypeScript is pinned to the 5.6 line.** TS ≥ 5.7 made `Uint8Array` generic, which breaks the Web Crypto `BufferSource` calls in the vault code. Don't upgrade it.

Deploys happen automatically: pushing to `master` (or `main`) runs `.github/workflows/deploy.yml`, which builds with `VITE_BASE` set to the repo subpath and publishes `dist/` to GitHub Pages.

## What this is

A static, no-backend PWA (React 18 + TypeScript + Vite + Tailwind) for reading phpBB forums that have the Tapatalk (mobiquo) plugin — a free alternative to the Tapatalk app. All state lives in the browser (Dexie/IndexedDB). Because a static site can't read cross-origin forum responses or manage forum cookies, every forum call goes through a small relay the **user** hosts (`proxy/worker.js` for Cloudflare Workers, `proxy/deno-relay.ts` for Deno Deploy).

## Architecture

The forum API stack is layered; each layer only knows the one below it:

1. `src/lib/xmlrpc.ts` — minimal XML-RPC codec. Tapatalk base64-encodes most human-readable strings in both directions: wrap outgoing string params with `b64()`, and incoming `<base64>` values are auto-decoded to UTF-8.
2. `src/forum/transport.ts` — `rpc()` POSTs the XML-RPC body to the relay with the target endpoint in `X-Forum-Mobiquo-Url` and the relay token as a Bearer header. Forum session cookies are shuttled via `X-Forum-Session` / `X-Set-Forum-Session` headers and cached **in memory only** (cleared on reload; the app re-logs-in as needed).
3. `src/forum/mobiquo.ts` — `MobiquoClient`, the typed Tapatalk client mapping raw structs to the domain types in `src/forum/types.ts`. Field extraction is deliberately defensive (`pickStr`/`pickInt`/`pickBool` probe several likely key names) because the mobiquo plugin varies across forum versions — keep that style when adding methods.
4. `src/forum/connection.ts` — `getClient(forumId)` hands out one logged-in client per forum, with lazy, de-duplicated login. Call `dropConnection()` on logout/delete/config change. `makeProbeClient()` builds a throwaway client for the Add-Forum probe flow.

Screens (`src/screens/`) call `getClient()` directly; routing is `HashRouter` (required for GitHub Pages) with forum-scoped paths like `/f/:forumId/t/:topicId` (see `src/App.tsx`).

### Persistence and the credential vault

- `src/db/db.ts` (Dexie, three tables: `settings`, `forums`, `vault`; types in `src/db/types.ts`). Schema changes require a new `this.version(n)` entry.
- Forum passwords are stored only as AES-GCM blobs (`ForumAccount.secrets`), encrypted with a data-encryption key (DEK) managed by `src/lib/vault.ts`. The current model is **no startup lock**: the raw DEK is stored on-device (`method: 'none'`) and loaded automatically at boot. WebAuthn/passphrase code paths exist only to unlock **legacy** vaults one final time and convert them — don't build new features on them.
- `vault.ts` holds the DEK in module state with a subscribe/emit pattern; `useVaultUnlocked()` is the React binding.
- The relay token is deliberately in `settings` (plaintext), not the vault — it only gates the user's own proxy.

### Conventions worth knowing

- Pagination uses mobiquo's inclusive `(start, end)` index convention via the `usePaged` hook (`src/hooks/usePaged.ts`), which also keeps module-level page snapshots keyed by `cacheKey` so navigating back restores results without refetching. The `cacheKey` must capture everything the loader depends on.
- Read/unread state is intentionally left to the forum server (the source of truth) — don't add local tracking.
- Post HTML is sanitized with DOMPurify; BBCode rendering lives in `src/lib/bbcode.tsx`.
- The service worker (vite-plugin-pwa in `vite.config.ts`) caches the app shell only; forum content is always fetched live.
- vBulletin also ships a mobiquo build but isn't wired up; the client abstraction is designed so it can be added without touching the UI.
