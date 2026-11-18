import { useEffect } from 'react';
import { create } from 'zustand';
import {
  listChangelog,
  subscribeChangelog,
  type ChangelogEntry,
} from '../lib/services/changelog';

const STORAGE_KEY = 'futsenai_changelog_seen';
const PAGE_SIZE = 10;

function readLastSeenVersion(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error('[changelog] failed to read last seen version:', error);
    return null;
  }
}

export function hasUnseenChangelog(entries: ChangelogEntry[], lastSeenVersion: string | null): boolean {
  const latestVersion = entries[0]?.version;
  if (!latestVersion) return false;
  if (!lastSeenVersion) return true;

  const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!versionPattern.test(latestVersion) || !versionPattern.test(lastSeenVersion)) return true;
  const latestParts = latestVersion.split('.').map(Number);
  const seenParts = lastSeenVersion.split('.').map(Number);
  for (let index = 0; index < Math.max(latestParts.length, seenParts.length); index++) {
    const latestPart = latestParts[index] ?? 0;
    const seenPart = seenParts[index] ?? 0;
    if (latestPart !== seenPart) return latestPart > seenPart;
  }
  return false;
}

interface ChangelogState {
  entries: ChangelogEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  lastSeenVersion: string | null;
  hasNew: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markSeen: (version?: string) => void;
}

let refreshSequence = 0;

export const useChangelogStore = create<ChangelogState>((set, get) => ({
  entries: [],
  loading: true,
  loadingMore: false,
  error: null,
  hasMore: false,
  lastSeenVersion: readLastSeenVersion(),
  hasNew: false,
  refresh: async () => {
    const sequence = ++refreshSequence;
    set({ loading: true, loadingMore: false, error: null });
    try {
      const rows = await listChangelog({ limit: PAGE_SIZE + 1 });
      if (sequence !== refreshSequence) return;
      const entries = rows.slice(0, PAGE_SIZE);
      const lastSeenVersion = get().lastSeenVersion;
      set({
        entries,
        hasMore: rows.length > PAGE_SIZE,
        loading: false,
        error: null,
        hasNew: hasUnseenChangelog(entries, lastSeenVersion),
      });
    } catch (error) {
      if (sequence !== refreshSequence) return;
      console.error('[changelog] failed to load entries:', error);
      set({
        loading: false,
        error: 'Não foi possível carregar o histórico.',
      });
    }
  },
  loadMore: async () => {
    const { entries, hasMore, loadingMore } = get();
    const cursor = entries[entries.length - 1];
    if (!hasMore || loadingMore || !cursor) return;

    const sequence = refreshSequence;
    set({ loadingMore: true, error: null });
    try {
      const rows = await listChangelog({
        limit: PAGE_SIZE + 1,
        before: { id: cursor.id, published_at: cursor.published_at },
      });
      if (sequence !== refreshSequence) return;
      const nextEntries = rows.slice(0, PAGE_SIZE);
      const allEntries = [...get().entries, ...nextEntries];
      set({
        entries: allEntries,
        hasMore: rows.length > PAGE_SIZE,
        loadingMore: false,
        hasNew: hasUnseenChangelog(allEntries, get().lastSeenVersion),
      });
    } catch (error) {
      if (sequence !== refreshSequence) return;
      console.error('[changelog] failed to load more entries:', error);
      set({
        loadingMore: false,
        error: 'Não foi possível carregar mais registros.',
      });
    }
  },
  markSeen: version => {
    const latestVersion = version ?? get().entries[0]?.version;
    if (!latestVersion) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, latestVersion);
    } catch (error) {
      console.error('[changelog] failed to save last seen version:', error);
    }
    set({
      lastSeenVersion: latestVersion,
      hasNew: hasUnseenChangelog(get().entries, latestVersion),
    });
  },
}));

let consumers = 0;
let removeRealtimeSubscription: (() => void) | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

export function useChangelog(): ChangelogState {
  useEffect(() => {
    consumers += 1;
    if (consumers === 1) {
      void useChangelogStore.getState().refresh();
      removeRealtimeSubscription = subscribeChangelog(() => {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => {
          refreshTimeout = null;
          void useChangelogStore.getState().refresh();
        }, 300);
      });
    }

    return () => {
      consumers -= 1;
      if (consumers === 0) {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = null;
        removeRealtimeSubscription?.();
        removeRealtimeSubscription = null;
      }
    };
  }, []);

  return useChangelogStore();
}
