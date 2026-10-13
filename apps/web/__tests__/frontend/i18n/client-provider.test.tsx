import { useQueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useLocale, useTranslations } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { Providers, createAppQueryClient } from '@/app/providers';
import { getCatalog } from '@/i18n/catalogs';

afterEach(cleanup);

function Probe({ name = 'Sam' }: { name?: string }) {
  const t = useTranslations('foundation');
  const locale = useLocale();
  const queryClient = useQueryClient();
  return <div>
    <p>{t('greeting', { name })}</p>
    <button>{t('actions.save')}</button>
    <output aria-label="active locale">{locale}</output>
    <output aria-label="query stale time">{queryClient.getDefaultOptions().queries?.staleTime as number}</output>
  </div>;
}

describe('client translations and existing provider composition', () => {
  it.each([
    ['en', 'Hello, Sam!', 'Save'],
    ['fr', 'Bonjour, Sam !', 'Enregistrer'],
    ['ar', 'مرحبًا، Sam!', 'حفظ'],
  ] as const)('makes the %s catalog available alongside Query', (locale, greeting, save) => {
    render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <Providers><Probe /></Providers>
    </NextIntlClientProvider>);
    expect(screen.getByText(greeting)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: save })).toBeInTheDocument();
    expect(screen.getByLabelText('active locale')).toHaveTextContent(locale);
    expect(screen.getByLabelText('query stale time')).toHaveTextContent('30000');
  });

  it('renders interpolated user values as text, without creating HTML', () => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">
      <Providers><Probe name={'<img src=x onerror=alert(1)>'} /></Providers>
    </NextIntlClientProvider>);
    expect(screen.getByText('Hello, <img src=x onerror=alert(1)>!')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('preserves Query defaults and separate QueryClient instances', () => {
    const first = createAppQueryClient();
    const second = createAppQueryClient();
    expect(first).not.toBe(second);
    expect(first.getDefaultOptions()).toMatchObject({
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    });
    first.setQueryData(['me'], { user: { id: 'first-user' } });
    expect(second.getQueryData(['me'])).toBeUndefined();
  });
});
