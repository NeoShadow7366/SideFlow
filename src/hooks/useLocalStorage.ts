import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`[SideFlow] Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Hydrate from Electron userData store if running in Electron and localStorage wasn't set yet
  useEffect(() => {
    let mounted = true;
    if (window.sideflow?.storeGetAll) {
      window.sideflow
        .storeGetAll()
        .then((store) => {
          if (!mounted || !store) return;
          if (store[key] !== undefined && !window.localStorage.getItem(key)) {
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

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        try {
          const valueToStore = value instanceof Function ? value(prev) : value;
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
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
