/**
 * Forum Reader relay — Cloudflare Worker.
 *
 * A small, stateless authenticated relay between the Forum Reader PWA and a
 * forum's Tapatalk (mobiquo) endpoint. It exists only to add the CORS headers
 * a browser requires and to shuttle the forum session cookie via custom
 * headers (browsers can't manage cross-origin cookies themselves).
 *
 * Deploy this under YOUR OWN Cloudflare account so your forum traffic and
 * credentials only ever pass through infrastructure you control.
 *
 * Configure (Worker Settings → Variables):
 *   RELAY_TOKEN   required — a long random secret; the app must send it too.
 *   ALLOWED_HOSTS optional — comma-separated forum hostnames you allow,
 *                 e.g. "forum.example.com,community.foo.org". Strongly
 *                 recommended so the Worker can't be used as an open relay.
 */

const FORUM_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) ForumReader/1.0';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Forum-Mobiquo-Url, X-Forum-Session',
    'Access-Control-Expose-Headers': 'X-Set-Forum-Session',
    'Access-Control-Max-Age': '86400'
  };
}

function deny(status, message) {
  return new Response(message, { status, headers: corsHeaders() });
}

/** Reduce one or more Set-Cookie headers to a clean "name=value; name2=value2". */
function packCookies(response) {
  let cookies = [];
  if (typeof response.headers.getSetCookie === 'function') {
    cookies = response.headers.getSetCookie();
  } else {
    const single = response.headers.get('set-cookie');
    if (single) cookies = [single];
  }
  const pairs = [];
  for (const c of cookies) {
    const first = c.split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq > 0) pairs.push(first.trim());
  }
  return pairs.join('; ');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return deny(405, 'Method not allowed');
    }

    // Shared-secret gate.
    if (env.RELAY_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.RELAY_TOKEN}`) {
        return deny(401, 'Unauthorized');
      }
    }

    const target = request.headers.get('X-Forum-Mobiquo-Url');
    if (!target) return deny(400, 'Missing X-Forum-Mobiquo-Url');

    let url;
    try {
      url = new URL(target);
    } catch {
      return deny(400, 'Invalid target URL');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return deny(400, 'Unsupported target protocol');
    }

    // Host allowlist (recommended).
    if (env.ALLOWED_HOSTS) {
      const allowed = env.ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase());
      if (!allowed.includes(url.hostname.toLowerCase())) {
        return deny(403, 'Target host not allowed');
      }
    }

    const fwdHeaders = {
      'Content-Type': request.headers.get('Content-Type') || 'text/xml',
      'User-Agent': FORUM_UA,
      Accept: 'text/xml, application/xml, */*'
    };
    const cookie = request.headers.get('X-Forum-Session');
    if (cookie) fwdHeaders['Cookie'] = cookie;

    let upstream;
    try {
      upstream = await fetch(url.toString(), {
        method: 'POST',
        headers: fwdHeaders,
        body: request.body,
        redirect: 'follow'
      });
    } catch (e) {
      return deny(502, `Upstream fetch failed: ${e}`);
    }

    const body = await upstream.arrayBuffer();
    const headers = {
      ...corsHeaders(),
      'Content-Type': upstream.headers.get('Content-Type') || 'text/xml'
    };
    const packed = packCookies(upstream);
    if (packed) headers['X-Set-Forum-Session'] = packed;

    return new Response(body, { status: upstream.status, headers });
  }
};
