import { runInNewContext } from 'node:vm';
import { renderToString } from 'react-dom/server';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getCatalog } from '@/i18n/catalogs';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { DocumentPresentation } from '@/components/language/document-presentation';
import { isThemePreference, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/frontend/theme';

class Scheme extends EventTarget { matches = false; }
let scheme: Scheme;
beforeEach(() => {
  localStorage.clear(); scheme = new Scheme(); vi.stubGlobal('matchMedia', vi.fn(() => scheme));
});
afterEach(() => {
  cleanup(); localStorage.clear(); document.documentElement.classList.remove('dark'); document.documentElement.style.removeProperty('color-scheme'); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function mount(locale: 'en' | 'fr' | 'ar' = 'en', compact = false) {
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><ThemeProvider><ThemeSelector compact={compact} /></ThemeProvider></NextIntlClientProvider>);
}
function osDark(matches: boolean) { act(() => { scheme.matches = matches; scheme.dispatchEvent(new Event('change')); }); }

it.each(['en', 'fr', 'ar'] as const)('selects localized Light/Dark/System modes and persists the preference in %s', async locale => {
  const t = getCatalog(locale).theme, user = userEvent.setup(); const view = mount(locale, true);
  const control = screen.getByRole('combobox', { name: t.label });
  expect(control).toBeEnabled(); expect(control).toHaveValue('system');
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([t.light, t.dark, t.system]);
  await user.selectOptions(control, 'dark'); expect(document.documentElement).toHaveClass('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark'); expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  osDark(false); expect(document.documentElement).toHaveClass('dark');
  view.unmount(); mount(locale); expect(screen.getByRole('combobox', { name: t.label })).toHaveValue('dark');
  await user.selectOptions(screen.getByRole('combobox'), 'light'); expect(document.documentElement).not.toHaveClass('dark');
  osDark(true); expect(document.documentElement).not.toHaveClass('dark');
  await user.selectOptions(screen.getByRole('combobox'), 'system'); expect(document.documentElement).toHaveClass('dark');
  osDark(false); expect(document.documentElement).not.toHaveClass('dark');
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
});
it('provides a labeled native keyboard focus target', async () => {
  mount(); await userEvent.tab(); expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveFocus();
  expect(screen.getByRole('combobox')).toHaveClass('focus-visible:ring-2');
});
it.each(['bogus', '', '<script>', null])('defaults safely to System for invalid stored preference %j', value => {
  if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);
  scheme.matches = true; mount(); expect(screen.getByRole('combobox')).toHaveValue('system'); expect(document.documentElement).toHaveClass('dark');
  expect(isThemePreference(value)).toBe(false);
});
it('works when persistent storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
  mount(); await userEvent.selectOptions(screen.getByRole('combobox'), 'dark'); expect(document.documentElement).toHaveClass('dark');
});
it('synchronizes changes and reset from another tab without writing them back', () => {
  mount(); const write = vi.spyOn(Storage.prototype, 'setItem');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' })));
  expect(document.documentElement).toHaveClass('dark'); expect(screen.getByRole('combobox')).toHaveValue('dark');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })));
  expect(screen.getByRole('combobox')).toHaveValue('system'); expect(document.documentElement).not.toHaveClass('dark'); expect(write).not.toHaveBeenCalled();
});
it('unsubscribes on unmount', () => {
  const remove = vi.spyOn(scheme, 'removeEventListener'); const view = mount(); view.unmount(); expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
});
it('renders the pre-paint initializer ahead of visible content and a stable SSR System selector', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  const html = renderToString(<DocumentPresentation initialLocale="ar"><ThemeSelector /></DocumentPresentation>);
  expect(html.indexOf('id="madrasio-theme-init"')).toBeLessThan(html.indexOf('<select'));
  expect(html).toContain(THEME_INIT_SCRIPT); expect(html).toContain('value="system" selected=""'); expect(html).toContain('disabled=""');
  expect(html).toContain('dir="rtl"'); expect(html).toContain('lang="ar"');
});
it.each(['light', 'dark', 'system', 'invalid'])('pre-paint initialization agrees with the mounted provider for %s', preference => {
  localStorage.setItem(THEME_STORAGE_KEY, preference); scheme.matches = true;
  runInNewContext(THEME_INIT_SCRIPT, { window, document, localStorage });
  const initial = document.documentElement.classList.contains('dark'); mount();
  expect(document.documentElement.classList.contains('dark')).toBe(initial); expect(initial).toBe(preference !== 'light');
});
