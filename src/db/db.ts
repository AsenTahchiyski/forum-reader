import Dexie, { type Table } from 'dexie';
import type { ForumAccount, Settings, VaultRecord } from './types';

class ForumDB extends Dexie {
  settings!: Table<Settings, 'default'>;
  forums!: Table<ForumAccount, number>;
  vault!: Table<VaultRecord, 'default'>;

  constructor() {
    super('forum-reader');
    this.version(1).stores({
      settings: 'id',
      forums: '++id, name, createdAt',
      vault: 'id'
    });
    this.version(2).stores({
      settings: 'id',
      forums: '++id, name, createdAt',
      vault: 'id',
      session: 'id'
    });
    // The reload-survival session cache is obsolete now that the DEK lives in
    // the vault record itself (no startup lock).
    this.version(3).stores({
      settings: 'id',
      forums: '++id, name, createdAt',
      vault: 'id',
      session: null
    });
  }
}

export const db = new ForumDB();

export const defaultSettings = (): Settings => {
  const now = Date.now();
  return {
    id: 'default',
    themeMode: 'system',
    accentColor: '#7aa2ff',
    favoriteForumId: null,
    proxyBaseUrl: '',
    relayToken: '',
    showMedia: true,
    onboarded: false,
    createdAt: now,
    updatedAt: now
  };
};

export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get('default');
  if (existing) return existing;
  const fresh = defaultSettings();
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.update('default', { ...patch, updatedAt: Date.now() });
}

// ---- Forums ---------------------------------------------------------------

export async function getForums(): Promise<ForumAccount[]> {
  return db.forums.orderBy('createdAt').toArray();
}

export async function getForum(id: number): Promise<ForumAccount | undefined> {
  return db.forums.get(id);
}

export async function addForum(
  forum: Omit<ForumAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const now = Date.now();
  const id = await db.forums.add({ ...forum, createdAt: now, updatedAt: now });
  return id as number;
}

export async function updateForum(
  id: number,
  patch: Partial<ForumAccount>
): Promise<void> {
  await db.forums.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteForum(id: number): Promise<void> {
  await db.forums.delete(id);
  const settings = await db.settings.get('default');
  if (settings?.favoriteForumId === id) {
    await updateSettings({ favoriteForumId: null });
  }
}

// ---- Vault ----------------------------------------------------------------

export async function getVault(): Promise<VaultRecord | undefined> {
  return db.vault.get('default');
}

export async function putVault(record: VaultRecord): Promise<void> {
  await db.vault.put(record);
}

export async function clearVault(): Promise<void> {
  await db.vault.delete('default');
}

/** Ask the browser to keep our storage durable (auto-granted for installed PWAs). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
