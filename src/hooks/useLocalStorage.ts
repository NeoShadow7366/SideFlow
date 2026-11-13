import { useState, useEffect, useCallback, useRef } from 'react';

const storeHydrationCache = new WeakMap<
  () => Promise<Record<string, unknown>>,
  Promise<Record<string, unknown>>
>();

const authoritativeStoreMap = new WeakMap<object, Record<string, unknown>>();

const LOCAL_STORAGE_SYNC_EVENT = 'sideflow:local-storage-sync';
const MIGRATION_FLAG_KEY = '__sideflow_store_v2_migrated';

interface LocalStorageSyncDetail {
  key: string;
  value: unknown;
  removed?: boolean;
}

/**
 * Resolves the synchronous authoritative Electron store snapshot when exposed by `preload.ts`
 * (`window.sideflow.getInitialStoreSnapshot`), running a one-time lossless migration of any
 * legacy `v1.9.0` `window.localStorage` `sideflow_*` keys and clearing redundant shadow copies.
 */
function getAuthoritativeElectronStore(): Record<string, unknown> | null {
  if (typeof window === 'undefined' || !window.sideflow) return null;
  const sideflowObj = window.sideflow as unknown as object;
  const existing = authoritativeStoreMap.get(sideflowObj);
  if (existing) return existing;

  const getter = (
    window.sideflow as {
      getInitialStoreSnapshot?: () => Record<string, unknown> | null;
    }
  ).getInitialStoreSnapshot;
  if (typeof getter !== 'function') {
    return null;
  }

  let initial: Record<string, unknown> | null = null;
  try {
    initial = getter();
  } catch {
    initial = null;
  }
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) {
    return null;
  }

  const cache: Record<string, unknown> = { ...initial };
  authoritativeStoreMap.set(sideflowObj, cache);

  // One-time seamless migration from legacy window.localStorage shadow keys -> sideflow-config.json
  if (cache[MIGRATION_FLAG_KEY] !== true) {
    try {
      const legacyKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sideflow_')) {
          legacyKeys.push(k);
        }
      }
      for (const k of legacyKeys) {
        const raw = window.localStorage.getItem(k);
        if (raw !== null && (cache[k] === undefined || cache[k] === null)) {
          try {
            const parsed = JSON.parse(raw);
            cache[k] = parsed;
            window.sideflow.storeSet?.(k, parsed);
          } catch {
            // ignore malformed legacy entry
          }
        }
        try {
          window.localStorage.removeItem(k);
        } catch {
          // ignore
        }
      }
      cache[MIGRATION_FLAG_KEY] = true;
      window.sideflow.storeSet?.(MIGRATION_FLAG_KEY, true);
    } catch {
      // ignore restricted storage environments
    }
  }

  return cache;
}

function getHydratedElectronStore(
  fetcher: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  let cached = storeHydrationCache.get(fetcher);
  if (!cached) {
    cached = fetcher().catch(() => ({}));
    storeHydrationCache.set(fetcher, cached);
  }
  return cached;
}

function dispatchStorageSync(detail: LocalStorageSyncDetail): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function'
  ) {
    window.dispatchEvent(
      new CustomEvent<LocalStorageSyncDetail>(LOCAL_STORAGE_SYNC_EVENT, {
        detail,
      })
    );
  }
}

/**
 * Reads a key synchronously from the authoritative Electron store (if active)
 * or falls back to `window.localStorage`.
 */
export function readSharedStorage<T>(key: string, fallback: T): T {
  const authStore = getAuthoritativeElectronStore();
  if (authStore) {
    if (authStore[key] !== undefined && authStore[key] !== null) {
      return authStore[key] as T;
    }
    return fallback;
  }
  try {
    const item = window.localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Atomically replaces the in-memory store cache & clears any stale localStorage shadow keys
 * after a full rolling-snapshot restore (`restoreStoreBackup`), broadcasting updates to all hooks.
 */
export function replaceSharedStoreSnapshot(
  nextStore: Record<string, unknown>
): void {
  const authStore = getAuthoritativeElectronStore();
  const previousKeys = new Set<string>();

  if (authStore) {
    for (const k of Object.keys(authStore)) {
      if (k.startsWith('sideflow_')) previousKeys.add(k);
      if (k !== MIGRATION_FLAG_KEY) {
        delete authStore[k];
      }
    }
    for (const [k, v] of Object.entries(nextStore)) {
      if (v !== undefined && v !== null) {
        authStore[k] = v;
      }
    }
    authStore[MIGRATION_FLAG_KEY] = true;
  } else {
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sideflow_')) {
          previousKeys.add(k);
        }
      }
      for (const k of previousKeys) {
        if (nextStore[k] === undefined || nextStore[k] === null) {
          window.localStorage.removeItem(k);
        }
      }
      for (const [k, v] of Object.entries(nextStore)) {
        if (k.startsWith('sideflow_') && v !== undefined && v !== null) {
          try {
            window.localStorage.setItem(keyNameSafe(k), JSON.stringify(v));
          } catch (err) {
            console.warn(
              `[SideFlow] Quota/write warning syncing key "${k}" during restore:`,
              err
            );
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const fetcher = window.sideflow?.storeGetAll;
  if (fetcher) {
    storeHydrationCache.set(fetcher, Promise.resolve({ ...nextStore }));
  }

  const allAffectedKeys = new Set<string>([
    ...previousKeys,
    ...Object.keys(nextStore).filter((k) => k.startsWith('sideflow_')),
  ]);
  for (const k of allAffectedKeys) {
    const val = nextStore[k];
    if (val === undefined || val === null) {
      dispatchStorageSync({ key: k, value: undefined, removed: true });
    } else {
      dispatchStorageSync({ key: k, value: val });
    }
  }
}

function keyNameSafe(k: string): string {
  return k;
}

/**
 * Writes a value to the authoritative Electron store (or browser localStorage in web preview),
 * persists via `window.sideflow.storeSet`, and notifies all `useLocalStorage(key)` hooks.
 */
export function writeSharedStorage<T>(key: string, value: T): void {
  const authStore = getAuthoritativeElectronStore();
  if (authStore) {
    authStore[key] = value;
  } else {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Never block Electron storeSet or React state updates if browser localStorage hits 5MB quota
      console.warn(`[SideFlow] Error writing localStorage key "${key}":`, error);
    }
  }

  const fetcher = window.sideflow?.storeGetAll;
  if (fetcher) {
    const cached = storeHydrationCache.get(fetcher);
    if (cached) {
      void cached.then((store) => {
        if (store && typeof store === 'object') {
          store[key] = value;
        }
      });
    }
  }

  if (window.sideflow?.storeSet) {
    window.sideflow.storeSet(key, value);
  }

  dispatchStorageSync({ key, value });
}

/**
 * Removes a key from shared storage, persists `null` to Electron `storeSet`,
 * and resets active `useLocalStorage(key)` hooks to their `initialValue`.
 */
export function removeSharedStorage(key: string): void {
  const authStore = getAuthoritativeElectronStore();
  if (authStore) {
    delete authStore[key];
  }
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[SideFlow] Error removing localStorage key "${key}":`, error);
  }

  const fetcher = window.sideflow?.storeGetAll;
  if (fetcher) {
    const cached = storeHydrationCache.get(fetcher);
    if (cached) {
      void cached.then((store) => {
        if (store && typeof store === 'object') {
          delete store[key];
        }
      });
    }
  }

  if (window.sideflow?.storeSet) {
    window.sideflow.storeSet(key, null);
  }

  dispatchStorageSync({ key, value: undefined, removed: true });
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() =>
    readSharedStorage<T>(key, initialValue)
  );

  const storedValueRef = useRef<T>(storedValue);
  storedValueRef.current = storedValue;

  const initialValueRef = useRef<T>(initialValue);
  initialValueRef.current = initialValue;

  // Async hydration fallback when `storeGetAll` is provided without synchronous `getInitialStoreSnapshot`
  useEffect(() => {
    if (getAuthoritativeElectronStore()) return;
    let mounted = true;
    const fetcher = window.sideflow?.storeGetAll;
    if (fetcher) {
      getHydratedElectronStore(fetcher)
        .then((store) => {
          if (!mounted || !store) return;
          if (
            store[key] !== undefined &&
            store[key] !== null &&
            window.localStorage.getItem(key) === null
          ) {
            const val = store[key] as T;
            storedValueRef.current = val;
            setStoredValue(val);
            try {
              window.localStorage.setItem(key, JSON.stringify(val));
            } catch {
              // ignore quota error during async hydration
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [key]);

  // Listen for cross-component updates (from writeSharedStorage, removeSharedStorage, or sibling useLocalStorage hooks)
  useEffect(() => {
    const handleSync = (event: Event) => {
      const custom = event as CustomEvent<LocalStorageSyncDetail>;
      if (!custom.detail || custom.detail.key !== key) return;
      if (custom.detail.removed) {
        storedValueRef.current = initialValueRef.current;
        setStoredValue(initialValueRef.current);
      } else {
        const next = custom.detail.value as T;
        if (!Object.is(storedValueRef.current, next)) {
          storedValueRef.current = next;
          setStoredValue(next);
        }
      }
    };
    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
    };
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      let nextValue: T;
      try {
        nextValue =
          value instanceof Function ? value(storedValueRef.current) : value;
      } catch (err) {
        console.warn(
          `[SideFlow] Error computing next state for key "${key}":`,
          err
        );
        return;
      }
      storedValueRef.current = nextValue;
      setStoredValue(nextValue);
      writeSharedStorage<T>(key, nextValue);
    },
    [key]
  );

  return [storedValue, setValue];
}
