/**
 * Connection manager: hands out a logged-in MobiquoClient per forum, reusing
 * the session across screens. Login happens lazily on first use and is
 * de-duplicated so concurrent screens don't double-login.
 */
import { ensureSettings, getForum } from '../db/db';
import { decryptSecrets } from '../lib/vault';
import { MobiquoClient } from './mobiquo';
import { clearSession, type CallContext } from './transport';

interface Conn {
  client: MobiquoClient;
  loggedIn: boolean;
}

const conns = new Map<number, Conn>();
const loginInFlight = new Map<number, Promise<void>>();

function sessionKey(forumId: number): string {
  return `forum:${forumId}`;
}

async function buildClient(forumId: number): Promise<MobiquoClient> {
  const settings = await ensureSettings();
  if (!settings.proxyBaseUrl) {
    throw new Error('Set your relay URL in Settings before connecting.');
  }
  const forum = await getForum(forumId);
  if (!forum) throw new Error('Forum not found.');

  const ctx: CallContext = {
    proxyBaseUrl: settings.proxyBaseUrl,
    relayToken: settings.relayToken || undefined,
    mobiquoUrl: forum.mobiquoUrl,
    sessionKey: sessionKey(forumId)
  };
  return new MobiquoClient(ctx);
}

async function doLogin(forumId: number, client: MobiquoClient): Promise<void> {
  const forum = await getForum(forumId);
  if (!forum) throw new Error('Forum not found.');
  const secrets = await decryptSecrets(forum.secrets);
  const result = await client.login(forum.username, secrets.password);
  if (!result.success) {
    throw new Error(result.error || 'Login failed.');
  }
}

/** Get a logged-in client for a forum, connecting if needed. */
export async function getClient(forumId: number): Promise<MobiquoClient> {
  let conn = conns.get(forumId);
  if (!conn) {
    conn = { client: await buildClient(forumId), loggedIn: false };
    conns.set(forumId, conn);
  }
  if (!conn.loggedIn) {
    let pending = loginInFlight.get(forumId);
    if (!pending) {
      const c = conn;
      pending = doLogin(forumId, c.client)
        .then(() => {
          c.loggedIn = true;
        })
        .finally(() => loginInFlight.delete(forumId));
      loginInFlight.set(forumId, pending);
    }
    await pending;
  }
  return conn.client;
}

/** Drop a forum's cached client + session (on logout / delete / config change). */
export function dropConnection(forumId: number): void {
  conns.delete(forumId);
  loginInFlight.delete(forumId);
  clearSession(sessionKey(forumId));
}

export function dropAllConnections(): void {
  for (const id of conns.keys()) clearSession(sessionKey(id));
  conns.clear();
  loginInFlight.clear();
}

/**
 * Build a throwaway client for an unsaved forum (used by Add-Forum to probe
 * the endpoint and verify the login before persisting anything).
 */
export function makeProbeClient(
  proxyBaseUrl: string,
  relayToken: string,
  mobiquoUrl: string
): MobiquoClient {
  return new MobiquoClient({
    proxyBaseUrl,
    relayToken: relayToken || undefined,
    mobiquoUrl,
    sessionKey: `probe:${mobiquoUrl}`
  });
}
