import { useState, useEffect, useCallback, useRef } from 'react';

const storeHydrationCache = new WeakMap<
  () => Promise<Record<string, unknown>>,
  Promise<Record<string, unknown>>
>();

const LOCAL_STORAGE_SYNC_EVENT = 'sideflow:local-storage-sync';

interface LocalStorageSyncDetail {
  key: string;
  value: unknown;
  removed?: boolean;
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

/**
 * Synchronously writes a value to window.localStorage, updates the cached Electron
 * hydration snapshot, persists via window.sideflow.storeSet, and notifies any active
 * useLocalStorage(key) hooks in the same window.
 */
export function writeSharedStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[SideFlow] Error writing localStorage key "${key}":`, error);
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
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent<LocalStorageSyncDetail>(LOCAL_STORAGE_SYNC_EVENT, {
        detail: { key, value },
      })
    );
  }
}

/**
 * Removes a key from window.localStorage, clears it from the cached Electron store
 * snapshot, persists `undefined` to Electron storeSet, and notifies active hooks.
 */
export function removeSharedStorage(key: string): void {
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
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent<LocalStorageSyncDetail>(LOCAL_STORAGE_SYNC_EVENT, {
        detail: { key, value: undefined, removed: true },
      })
    );
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`[SideFlow] Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Hydrate from Electron userData store if running in Electron and localStorage wasn't set yet
  useEffect(() => {
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
            setStoredValue(val);
            window.localStorage.setItem(key, JSON.stringify(val));
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [key]);

  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  // Listen for cross-component writeSharedStorage / removeSharedStorage events in the same window
  useEffect(() => {
    const handleSync = (event: Event) => {
      const custom = event as CustomEvent<LocalStorageSyncDetail>;
      if (!custom.detail || custom.detail.key !== key) return;
      if (custom.detail.removed) {
        setStoredValue(initialValueRef.current);
      } else {
        setStoredValue(custom.detail.value as T);
      }
    };
    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
    };
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        try {
          const valueToStore = value instanceof Function ? value(prev) : value;
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          const fetcher = window.sideflow?.storeGetAll;
          if (fetcher) {
            const cached = storeHydrationCache.get(fetcher);
            if (cached) {
              void cached.then((store) => {
                if (store && typeof store === 'object') {
                  store[key] = valueToStore;
                }
              });
            }
          }
          if (window.sideflow?.storeSet) {
            window.sideflow.storeSet(key, valueToStore);
          }
          return valueToStore;
        } catch (error) {
          console.warn(`[SideFlow] Error setting localStorage key "${key}":`, error);
          return prev;
        }
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
