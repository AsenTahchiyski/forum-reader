/**
 * Transport: send an XML-RPC call to a forum's mobiquo endpoint *through the
 * user's relay Worker*. The browser can't read cross-origin forum responses or
 * manage forum cookies directly (CORS), so the Worker adds permissive CORS
 * headers and shuttles the forum session cookie via custom headers, which we
 * carry ourselves here.
 */
import { decodeResponse, encodeMethodCall, type XmlRpcValue } from '../lib/xmlrpc';

export interface CallContext {
  /** Base URL of the self-hosted relay Worker. */
  proxyBaseUrl: string;
  /** Forum's mobiquo endpoint, e.g. https://x.com/forum/mobiquo/mobiquo.php */
  mobiquoUrl: string;
  /** Shared secret expected by the Worker. */
  relayToken?: string;
  /** Key under which this forum's session cookie is cached in memory. */
  sessionKey: string;
}

// In-memory forum session cookies (cleared on reload — we re-login as needed).
const sessions = new Map<string, string>();

export function getSession(key: string): string | undefined {
  return sessions.get(key);
}

export function clearSession(key: string): void {
  sessions.delete(key);
}

/** Merge an incoming "a=1; b=2" cookie string into the cached one (by name). */
function mergeCookies(existing: string | undefined, incoming: string): string {
  const jar = new Map<string, string>();
  const load = (s: string | undefined) => {
    if (!s) return;
    for (const part of s.split(';')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) jar.set(name, value);
    }
  };
  load(existing);
  load(incoming);
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export async function rpc(
  ctx: CallContext,
  method: string,
  params: unknown[] = []
): Promise<XmlRpcValue> {
  if (!ctx.proxyBaseUrl) {
    throw new Error('No relay URL configured. Add one in Settings.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/xml',
    'X-Forum-Mobiquo-Url': ctx.mobiquoUrl
  };
  if (ctx.relayToken) headers['Authorization'] = `Bearer ${ctx.relayToken}`;

  const cached = sessions.get(ctx.sessionKey);
  if (cached) headers['X-Forum-Session'] = cached;

  let res: Response;
  try {
    res = await fetch(ctx.proxyBaseUrl, {
      method: 'POST',
      headers,
      body: encodeMethodCall(method, params)
    });
  } catch {
    throw new Error(
      'Could not reach the relay. Check the proxy URL and your connection.'
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 401 || res.status === 403) {
      throw new Error('Relay rejected the request (check the relay token).');
    }
    throw new Error(`Relay error ${res.status}. ${detail}`.trim());
  }

  const incomingCookie = res.headers.get('X-Set-Forum-Session');
  if (incomingCookie) {
    sessions.set(ctx.sessionKey, mergeCookies(cached, incomingCookie));
  }

  return decodeResponse(await res.text());
}
