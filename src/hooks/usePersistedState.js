import { useEffect, useState } from 'react';

export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // Si la caché está dañada, se utiliza el valor inicial.
    }
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`No se pudo guardar la caché local (${key}):`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
