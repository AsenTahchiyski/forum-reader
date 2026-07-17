# Forum Reader — relay proxy

Forum Reader is a static PWA. Browsers can't read cross-origin forum responses
or manage forum cookies (CORS), so the app talks to your forums **through this
tiny relay**, which you host yourself. Your forum traffic and credentials only
ever pass through infrastructure **you** control.

You only need to do this once. Two options — pick one.

---

## Option A — Cloudflare Worker (recommended, free)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Create Worker**. Give it a name and **Deploy** the starter.
2. **Edit code**, paste the entire contents of [`worker.js`](./worker.js), **Deploy**.
3. **Settings → Variables and Secrets**, add:
   - `RELAY_TOKEN` — a long random string (e.g. run `openssl rand -hex 24`). Keep it.
   - `ALLOWED_HOSTS` — comma-separated forum hostnames you'll use, e.g.
     `forum.example.com,community.foo.org`. Recommended; without it the relay
     will forward to any host (still gated by the token).
4. Copy your Worker URL, e.g. `https://forum-relay.your-name.workers.dev`.

In the app → **Settings → Relay**, paste the Worker URL and the `RELAY_TOKEN`.

### Optional: deploy with Wrangler instead

```bash
npm i -g wrangler
wrangler init forum-relay      # then replace src/index.js with worker.js
wrangler secret put RELAY_TOKEN
wrangler deploy
```

---

## Option B — Deno Deploy (free)

1. Create a project at <https://dash.deno.com>.
2. Use [`deno-relay.ts`](./deno-relay.ts) as the entry point (link a repo or
   paste via the playground).
3. Set env vars `RELAY_TOKEN` (required) and `ALLOWED_HOSTS` (optional).
4. Put the project URL + token into the app's **Settings → Relay**.

---

## How it works

```
PWA  --POST (XML-RPC body)-->  relay  --POST-->  forum /mobiquo/mobiquo.php
     <--XML + CORS + cookie--          <--XML + Set-Cookie--
```

- The app sends the target endpoint in `X-Forum-Mobiquo-Url` and the relay
  token in `Authorization: Bearer …`.
- The relay forwards the XML-RPC body, returns the response with
  `Access-Control-Allow-Origin: *`, and packs the forum's `Set-Cookie` into the
  `X-Set-Forum-Session` response header so the app can maintain the login
  session across calls.

## Troubleshooting

- **Every forum call fails with "Invalid action".** The relay is reaching your
  forum but the request body is arriving empty, so the Tapatalk plugin sees no
  method. This happens when the forwarded POST is sent with chunked transfer
  encoding and the forum's server (commonly Apache behind a CDN) drops chunked
  bodies. The relay avoids this by buffering the body so every forwarded POST
  carries a `Content-Length` — make sure you're running the current
  [`worker.js`](./worker.js) / [`deno-relay.ts`](./deno-relay.ts); if you
  deployed an older copy, re-paste and redeploy.

## Security notes

- **Set `RELAY_TOKEN`.** It stops strangers from using your relay.
- **Set `ALLOWED_HOSTS`.** It stops the relay being used as an open proxy.
- The relay is stateless — it stores nothing. Your credentials live only on
  your device (AES-GCM encrypted, unlocked by biometrics/passphrase) and travel
  to your own forums via your own relay.
