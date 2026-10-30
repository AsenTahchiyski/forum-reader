import { useSyncExternalStore } from 'react';
import { getSyncNotice, getSyncState, subscribeSync } from '../lib/syncFile';

export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

export function useSyncNotice() {
  return useSyncExternalStore(subscribeSync, getSyncNotice, getSyncNotice);
}
