import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSelector } from '@/components/language/language-selector';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';
import { setPresentationLocale } from '@/i18n/actions';
import { getCatalog } from '@/i18n/catalogs';
import { SUPPORTED_LOCALES } from '@school/shared';

vi.mock('@/i18n/actions', () => ({ setPresentationLocale: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(setPresentationLocale).mockReset().mockResolvedValue(undefined); });

describe('browser cookie language selection', () => {
  it.each(SUPPORTED_LOCALES)('renders %s with all three native options without Auth or School context', (locale) => {
    render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><LanguageSelector /></NextIntlClientProvider>);
    expect(screen.getByRole('combobox')).toHaveValue(locale);
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['English', 'Français', 'العربية']);
    expect(screen.getByRole('option', { name: 'العربية' })).toHaveAttribute('dir', 'rtl');
  });
  it('writes once and reloads only after the server confirms the cookie', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    let resolve: () => void = () => {};
    vi.mocked(setPresentationLocale).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><LanguageSelector /></NextIntlClientProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } });
    expect(setPresentationLocale).toHaveBeenCalledWith('fr');
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(reload).not.toHaveBeenCalled();
    resolve(); await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
  it('retains the current language and reports failed saves without reloading', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    vi.mocked(setPresentationLocale).mockRejectedValue(new Error('synthetic failure'));
    render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><LanguageSelector /></NextIntlClientProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ar' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(getCatalog('en').languagePreference.saveUncertain);
    expect(screen.getByRole('combobox')).toHaveValue('en'); expect(reload).not.toHaveBeenCalled();
  });
  it('mounts a functional selector in the existing shell slot', () => {
    render(<NextIntlClientProvider locale="fr" messages={getCatalog('fr')} timeZone="UTC"><LanguagePreferenceSlot placement="app-shell" /></NextIntlClientProvider>);
    expect(screen.getByRole('combobox')).toHaveValue('fr');
    expect(screen.getByRole('combobox')).toHaveAccessibleName(getCatalog('fr').languagePreference.label);
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(getCatalog('fr').languagePreference.hint);
  });
});
