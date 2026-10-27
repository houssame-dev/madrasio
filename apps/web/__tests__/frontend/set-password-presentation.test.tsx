import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { SetPasswordPresentation } from '@/components/language/auth-presentation';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { getCatalog } from '@/i18n/catalogs';

const updateUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth: { updateUser } }) }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  updateUser.mockReset();
});
function mount(locale: 'en' | 'fr' | 'ar', invalid: boolean) {
  const client = new QueryClient();
  clients.push(client);
  return render(
    <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <SetPasswordPresentation invalid={invalid} />
          </div>
        </ThemeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

it.each(['en', 'fr', 'ar'] as const)(
  'keeps the %s unavailable-link state free of editable password controls',
  (locale) => {
    const t = getCatalog(locale);
    const view = mount(locale, true);
    expect(view.container.querySelector('.auth-password')).toBeInTheDocument();
    expect(view.container.querySelector('input')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(t.recovery.invalid);
    expect(screen.getByRole('link', { name: t.recovery.title })).toHaveAttribute(
      'href',
      '/auth/recover',
    );
    expect(screen.getByRole('link', { name: t.recoveryShowcase.back })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(updateUser).not.toHaveBeenCalled();
  },
);

it.each(['en', 'fr', 'ar'] as const)(
  'provides independently labeled visibility controls and associated validation in %s',
  async (locale) => {
    const t = getCatalog(locale);
    mount(locale, false);
    const first = screen.getByLabelText(t.password.newPassword);
    const second = screen.getByLabelText(t.password.confirmation);
    expect(first).toHaveAttribute('autocomplete', 'new-password');
    expect(second).toHaveAttribute('aria-describedby', 'confirm-password-hint');
    expect(second).toHaveAccessibleDescription(t.validation.passwordShort);
    await userEvent.click(screen.getByRole('button', { name: t.passwordShowcase.showNew }));
    expect(first).toHaveAttribute('type', 'text');
    expect(second).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: t.passwordShowcase.hideNew })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: t.passwordShowcase.showConfirm }));
    expect(second).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: t.passwordShowcase.submit }));
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAttribute('aria-describedby', 'new-password-error');
    expect(first).toHaveFocus();
    expect(updateUser).not.toHaveBeenCalled();
  },
);
