import { useSyncExternalStore } from 'react';
import { isUnlocked, subscribe } from '../lib/vault';

/** Reactive boolean that flips whenever the vault locks or unlocks. */
export function useVaultUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isUnlocked, isUnlocked);
}
