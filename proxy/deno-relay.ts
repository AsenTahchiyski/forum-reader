/**
 * Forum Reader relay — Deno Deploy variant (alternative to the Cloudflare
 * Worker in worker.js). Same behavior; deploy under your own Deno Deploy
 * project. Configure env vars RELAY_TOKEN (required) and ALLOWED_HOSTS
 * (optional, comma-separated hostnames).
 */

const FORUM_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) ForumReader/1.0';

const RELAY_TOKEN = Deno.env.get('RELAY_TOKEN') ?? '';
const ALLOWED_HOSTS = (Deno.env.get('ALLOWED_HOSTS') ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Forum-Mobiquo-Url, X-Forum-Session',
    'Access-Control-Expose-Headers': 'X-Set-Forum-Session',
    'Access-Control-Max-Age': '86400'
  };
}

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: corsHeaders() });

function packCookies(res: Response): string {
  const cookies =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie ===
    'function'
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];
  const pairs: string[] = [];
  for (const c of cookies) {
    const first = c.split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq > 0) pairs.push(first.trim());
  }
  return pairs.join('; ');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'POST') return deny(405, 'Method not allowed');

  if (RELAY_TOKEN) {
    if (request.headers.get('Authorization') !== `Bearer ${RELAY_TOKEN}`) {
      return deny(401, 'Unauthorized');
    }
  }

  const target = request.headers.get('X-Forum-Mobiquo-Url');
  if (!target) return deny(400, 'Missing X-Forum-Mobiquo-Url');

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return deny(400, 'Invalid target URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return deny(400, 'Unsupported target protocol');
  }
  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) {
    return deny(403, 'Target host not allowed');
  }

  const fwdHeaders: Record<string, string> = {
    'Content-Type': request.headers.get('Content-Type') || 'text/xml',
    'User-Agent': FORUM_UA,
    Accept: 'text/xml, application/xml, */*'
  };
  const cookie = request.headers.get('X-Forum-Session');
  if (cookie) fwdHeaders['Cookie'] = cookie;

  // Buffer the body so the forwarded POST carries a Content-Length. Streaming
  // request.body straight through makes the subrequest use chunked transfer
  // encoding, and some forum servers (e.g. Apache behind a CDN) drop chunked
  // POST bodies — the mobiquo plugin then sees no method and replies
  // "Invalid action". A buffered body is sent exactly like a normal browser POST.
  const reqBody = await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: 'POST',
      headers: fwdHeaders,
      body: reqBody,
      redirect: 'follow'
    });
  } catch (e) {
    return deny(502, `Upstream fetch failed: ${e}`);
  }

  const headers: Record<string, string> = {
    ...corsHeaders(),
    'Content-Type': upstream.headers.get('Content-Type') || 'text/xml'
  };
  const packed = packCookies(upstream);
  if (packed) headers['X-Set-Forum-Session'] = packed;

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers
  });
});
