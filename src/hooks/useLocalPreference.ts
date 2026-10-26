import { useCallback, useEffect, useState } from 'react';

export function useLocalPreference<T>(key: string, normalize: (value?: unknown) => T) {
  const [value, setValue] = useState(() => {
    try {
      return normalize(JSON.parse(localStorage.getItem(key) ?? 'null'));
    } catch {
      return normalize();
    }
  });
  const update = useCallback((next: T) => setValue(normalize(next)), [normalize]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* The current session remains usable when preference storage is blocked. */
    }
  }, [key, value]);
  return [value, update] as const;
}
