'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { isThemePreference, THEME_STORAGE_KEY, type ThemePreference } from '@/lib/frontend/theme';

const ThemeContext = createContext<{ theme: ThemePreference; ready: boolean; setTheme: (theme: ThemePreference) => void }>({ theme: 'system', ready: false, setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

function applyTheme(value: ThemePreference) {
  const dark = value === 'dark' || value === 'midnight' || value === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = value === 'system' ? (dark ? 'midnight' : 'light') : value;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Identical SSR/first-client snapshots. Storage is read only after hydration.
  const [theme, updateTheme] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const preference = useRef<ThemePreference>('system');
  function setTheme(value: ThemePreference) {
    if (!isThemePreference(value)) return;
    preference.current = value;
    updateTheme(value);
    applyTheme(value);
    // Storage may be unavailable in private/locked-down browsers; keep session behavior usable.
    try { window.localStorage.setItem(THEME_STORAGE_KEY, value); } catch { /* Local preference remains in memory. */ }
  }
  useEffect(() => {
    let stored: unknown;
    try { stored = window.localStorage.getItem(THEME_STORAGE_KEY); } catch { /* System is the default. */ }
    const initial = isThemePreference(stored) ? stored : 'system';
    preference.current = initial; updateTheme(initial); applyTheme(initial); setReady(true);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystemChange = () => { if (preference.current === 'system') applyTheme('system'); };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage || event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const value = isThemePreference(event.newValue) ? event.newValue : 'system';
      preference.current = value; updateTheme(value); applyTheme(value);
    };
    media?.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => { media?.removeEventListener('change', onSystemChange); window.removeEventListener('storage', onStorage); };
  }, []);
  return <ThemeContext.Provider value={{ theme, ready, setTheme }}>{children}</ThemeContext.Provider>;
}
