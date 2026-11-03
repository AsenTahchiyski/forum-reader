/**
 * Mirrors the app's settings and forum list (never passwords or the relay
 * token) to a human-readable JSON file the user picks, so several devices can
 * share one config (e.g. a file on a NAS or a synced folder).
 *
 * Live sync uses the File System Access API (Chromium only); elsewhere the
 * Settings screen falls back to manual export / import of the same JSON.
 *
 * Sync is a three-way check against `SyncRecord.lastSynced`: whichever side
 * changed since then wins; if both did, the newer one wins (last write wins).
 * Forums are matched across devices by endpoint + username, since local ids
 * differ per device.
 */
import { liveQuery } from 'dexie';
import { db } from '../db/db';
import type { ForumAccount, Settings, SyncRecord, ThemeMode } from '../db/types';
import { dropAllConnections, dropConnection } from '../forum/connection';
import { t, type Lang } from './i18n';

// Not in TypeScript's DOM lib yet.
declare global {
  interface Window {
    showSaveFilePicker?(opts?: object): Promise<FileSystemFileHandle>;
    showOpenFilePicker?(opts?: object): Promise<FileSystemFileHandle[]>;
  }
  interface FileSystemHandle {
    queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
    requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  }
}

const FILE_TYPES = [
  { description: 'Forum Reader config', accept: { 'application/json': ['.json'] } }
];
const SUGGESTED_NAME = 'forum-reader.json';
const FORMAT_VERSION = 1;

interface SyncedForum {
  name: string;
  baseUrl: string;
  mobiquoUrl: string;
  username: string;
  avatarUrl?: string;
  brandColor?: string;
  blockedUsers?: string[];
  createdAt: number;
}

interface ForumRef {
  mobiquoUrl: string;
  username: string;
}

/** What gets synced; compared as a canonical JSON string. */
interface SyncContent {
  settings: {
    themeMode: ThemeMode;
    accentColor: string;
    language?: Lang;
    showMedia: boolean;
    readingScale?: number;
    proxyBaseUrl: string;
    favoriteForum: ForumRef | null;
  };
  forums: SyncedForum[];
}

export type SyncState =
  | { kind: 'off' }
  | { kind: 'needs-permission'; fileName: string }
  | { kind: 'connected'; fileName: string; lastSyncAt?: number }
  | { kind: 'error'; fileName: string; message: string };

export const liveSyncSupported =
  typeof window !== 'undefined' && !!window.showSaveFilePicker && !!window.showOpenFilePicker;

// ---- State + subscription (same pattern as vault.ts) ----------------------

let state: SyncState = { kind: 'off' };
let notice: string | null = null;
const listeners = new Set<() => void>();

function setState(next: SyncState): void {
  state = next;
  listeners.forEach((l) => l());
}

function setNotice(next: string | null): void {
  notice = next;
  listeners.forEach((l) => l());
}

export const getSyncState = (): SyncState => state;
export const getSyncNotice = (): string | null => notice;
export const clearSyncNotice = (): void => setNotice(null);

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- Canonical content ----------------------------------------------------

const forumKey = (f: ForumRef): string => `${f.mobiquoUrl}\n${f.username.toLowerCase()}`;

/** Validate + canonicalize (fixed key order) anything claiming to be sync content. */
function normalize(raw: unknown): SyncContent {
  const r = raw as Partial<SyncContent> | null;
  if (!r || typeof r !== 'object' || !r.settings || !Array.isArray(r.forums)) {
    throw new Error(t('sync.invalidFile'));
  }
  const s = r.settings;
  const fav = s.favoriteForum;
  return {
    settings: {
      themeMode: s.themeMode === 'light' || s.themeMode === 'dark' ? s.themeMode : 'system',
      accentColor: String(s.accentColor || '#7aa2ff'),
      language: s.language === 'en' || s.language === 'bg' ? s.language : undefined,
      showMedia: s.showMedia !== false,
      readingScale: typeof s.readingScale === 'number' ? s.readingScale : undefined,
      proxyBaseUrl: String(s.proxyBaseUrl || ''),
      favoriteForum:
        fav && fav.mobiquoUrl && fav.username
          ? { mobiquoUrl: String(fav.mobiquoUrl), username: String(fav.username) }
          : null
    },
    forums: r.forums
      .filter((f) => f && f.mobiquoUrl && f.username)
      .map((f) => ({
        name: String(f.name || ''),
        baseUrl: String(f.baseUrl || ''),
        mobiquoUrl: String(f.mobiquoUrl),
        username: String(f.username),
        avatarUrl: f.avatarUrl ? String(f.avatarUrl) : undefined,
        brandColor: f.brandColor ? String(f.brandColor) : undefined,
        blockedUsers:
          Array.isArray(f.blockedUsers) && f.blockedUsers.length
            ? f.blockedUsers.map(String)
            : undefined,
        createdAt: Number(f.createdAt) || 0
      }))
  };
}

function toContent(settings: Settings, forums: ForumAccount[]): SyncContent {
  const fav = forums.find((f) => f.id === settings.favoriteForumId);
  return normalize({
    settings: {
      ...settings,
      favoriteForum: fav ? { mobiquoUrl: fav.mobiquoUrl, username: fav.username } : null
    },
    forums
  });
}

async function localContent(): Promise<string> {
  const [settings, forums] = await Promise.all([
    db.settings.get('default'),
    db.forums.orderBy('createdAt').toArray()
  ]);
  return settings ? JSON.stringify(toContent(settings, forums)) : '';
}

function parseFile(text: string): { content: SyncContent; updatedAt: number } | null {
  if (!text.trim()) return null;
  let raw: { updatedAt?: string };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t('sync.invalidFile'));
  }
  return { content: normalize(raw), updatedAt: Date.parse(raw.updatedAt ?? '') || 0 };
}

function serialize(content: string): string {
  return JSON.stringify(
    {
      app: 'forum-reader',
      version: FORMAT_VERSION,
      updatedAt: new Date().toISOString(),
      ...JSON.parse(content)
    },
    null,
    2
  );
}

// ---- Applying incoming content --------------------------------------------

/**
 * Write incoming content into the local DB. 'replace' mirrors the file
 * exactly (forums missing from it are removed here too); 'merge' only adds and
 * updates, so a device's password-bearing forums are never lost on first link
 * or on a manual import.
 */
async function applyContent(c: SyncContent, mode: 'replace' | 'merge'): Promise<void> {
  const dropped: number[] = [];
  let relayChanged = false;
  await db.transaction('rw', db.settings, db.forums, async () => {
    const now = Date.now();
    const local = await db.forums.toArray();
    const byKey = new Map(local.map((f) => [forumKey(f), f]));
    const incoming = new Set<string>();

    for (const f of c.forums) {
      const key = forumKey(f);
      incoming.add(key);
      const existing = byKey.get(key);
      if (existing) {
        await db.forums.update(existing.id!, {
          name: f.name,
          baseUrl: f.baseUrl,
          avatarUrl: f.avatarUrl,
          brandColor: f.brandColor,
          blockedUsers: f.blockedUsers,
          updatedAt: now
        });
      } else {
        const id = (await db.forums.add({ ...f, updatedAt: now })) as number;
        byKey.set(key, { ...f, id, updatedAt: now });
      }
    }
    if (mode === 'replace') {
      for (const f of local) {
        if (!incoming.has(forumKey(f))) {
          await db.forums.delete(f.id!);
          dropped.push(f.id!);
        }
      }
    }

    const { favoriteForum, ...rest } = c.settings;
    const settings = await db.settings.get('default');
    relayChanged = !!settings && settings.proxyBaseUrl !== rest.proxyBaseUrl;
    await db.settings.update('default', {
      ...rest,
      favoriteForumId: favoriteForum ? (byKey.get(forumKey(favoriteForum))?.id ?? null) : null,
      updatedAt: now
    });
  });
  dropped.forEach(dropConnection);
  if (relayChanged) dropAllConnections();
}

// ---- Sync engine ----------------------------------------------------------

// Every sync step runs one at a time so a local edit can't race a pull.
let queue: Promise<void> = Promise.resolve();
function enqueue(step: () => Promise<void>): Promise<void> {
  queue = queue.then(step, step);
  return queue;
}

async function writeFile(rec: SyncRecord, content: string): Promise<void> {
  const w = await rec.handle.createWritable();
  await w.write(serialize(content));
  await w.close();
}

async function runSync(): Promise<void> {
  const rec = await db.sync.get('default');
  if (!rec) return;
  try {
    if ((await rec.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      setState({ kind: 'needs-permission', fileName: rec.fileName });
      return;
    }
    const file = parseFile(await (await rec.handle.getFile()).text());
    const fileContent = file ? JSON.stringify(file.content) : null;
    const local = await localContent();

    let pull = false;
    if (fileContent === null || fileContent === local) {
      pull = false;
    } else if (rec.lastSynced === '') {
      pull = true; // freshly linked existing file: adopt it (merged)
    } else if (local === rec.lastSynced) {
      pull = true; // only the file changed
    } else if (fileContent === rec.lastSynced) {
      pull = false; // only this device changed
    } else {
      // Both changed: last write wins.
      pull = file!.updatedAt > rec.localChangedAt;
      setNotice(pull ? t('sync.conflictFile') : t('sync.conflictLocal'));
    }

    if (pull) await applyContent(file!.content, rec.lastSynced === '' ? 'merge' : 'replace');
    const now = await localContent();
    if (now !== fileContent) await writeFile(rec, now);

    const lastSyncAt = Date.now();
    await db.sync.update('default', { lastSynced: now, lastSyncAt });
    setState({ kind: 'connected', fileName: rec.fileName, lastSyncAt });
  } catch (err) {
    setState({
      kind: 'error',
      fileName: rec.fileName,
      message: err instanceof Error ? err.message : String(err)
    });
  }
}

export const syncNow = (): Promise<void> => enqueue(runSync);

async function onLocalChange(content: string): Promise<void> {
  const rec = await db.sync.get('default');
  if (!rec || content === rec.lastSynced) return;
  await db.sync.update('default', { localChangedAt: Date.now() });
  if (state.kind === 'connected') await runSync();
}

let started = false;

/** Call once at boot: restores the linked file and starts watching for edits. */
export async function initSync(): Promise<void> {
  if (started) return;
  started = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  liveQuery(localContent).subscribe((content) => {
    // The initial emission is the state at boot, not an edit.
    if (first) {
      first = false;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => enqueue(() => onLocalChange(content)), 400);
  });
  // Pick up edits made on other devices when the app comes back to the front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.kind === 'connected') syncNow();
  });

  const rec = await db.sync.get('default');
  if (rec) await syncNow();
}

async function link(handle: FileSystemFileHandle): Promise<void> {
  if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
  await db.sync.put({
    id: 'default',
    handle,
    fileName: handle.name,
    lastSynced: '',
    localChangedAt: Date.now()
  });
  await syncNow();
}

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

/** Create (or overwrite) a file and fill it with this device's config. */
export async function createSyncFile(): Promise<void> {
  try {
    const handle = await window.showSaveFilePicker!({
      suggestedName: SUGGESTED_NAME,
      types: FILE_TYPES
    });
    // Empty it first so the sync pushes local data instead of adopting old content.
    const w = await handle.createWritable();
    await w.close();
    await link(handle);
  } catch (err) {
    if (!isAbort(err)) throw err;
  }
}

/** Link an existing file: its config is merged into this device's. */
export async function openSyncFile(): Promise<void> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types: FILE_TYPES });
    await link(handle);
  } catch (err) {
    if (!isAbort(err)) throw err;
  }
}

/** Re-grant file access after a reload (must run from a user gesture). */
export async function reconnectSync(): Promise<void> {
  const rec = await db.sync.get('default');
  if (!rec) return;
  if ((await rec.handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
    await syncNow();
  }
}

export async function disconnectSync(): Promise<void> {
  await enqueue(async () => {
    await db.sync.delete('default');
    setState({ kind: 'off' });
    setNotice(null);
  });
}

// ---- Manual export / import (fallback for browsers without live sync) ------

export async function exportConfig(): Promise<void> {
  const blob = new Blob([serialize(await localContent())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = SUGGESTED_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Merge a previously exported file into this device's config. */
export async function importConfig(file: File): Promise<void> {
  const parsed = parseFile(await file.text());
  if (!parsed) throw new Error(t('sync.invalidFile'));
  await applyContent(parsed.content, 'merge');
}
