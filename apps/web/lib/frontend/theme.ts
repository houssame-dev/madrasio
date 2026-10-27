export const THEME_STORAGE_KEY = 'madrasio-theme';
export type ThemePreference = 'light' | 'mist' | 'midnight' | 'dark' | 'system';
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'mist' || value === 'midnight' || value === 'dark' || value === 'system';
}

// First in <body>, before any visible content paints. Keep in sync with the provider contract.
// No user-controlled values are interpolated into executable source.
export const THEME_INIT_SCRIPT = `(function(){var t='system';try{var v=localStorage.getItem('${THEME_STORAGE_KEY}');if(v==='light'||v==='mist'||v==='midnight'||v==='dark'||v==='system')t=v}catch(e){}var d=t==='dark'||t==='midnight'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=t==='system'?(d?'midnight':'light'):t;document.documentElement.classList.toggle('dark',!!d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;
