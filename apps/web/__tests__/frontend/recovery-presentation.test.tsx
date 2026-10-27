import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RecoveryPresentation } from '@/components/language/auth-presentation';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { getCatalog } from '@/i18n/catalogs';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/frontend/api-client', async (original) => ({
  ...(await original<object>()),
  apiRequest: mocks.request,
}));
beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue({ data: { state: 'REQUESTED' } });
});
afterEach(() => cleanup());
function mount(locale: 'en' | 'fr' | 'ar' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <ThemeProvider>
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <RecoveryPresentation />
        </div>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

it.each(['en', 'fr', 'ar'] as const)(
  'keeps the canonical recovery request and generic confirmation in the %s redesign',
  async (locale) => {
    const t = getCatalog(locale);
    const view = mount(locale);
    expect(view.container.querySelector('.auth-recover .auth-shell')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: t.recoveryShowcase.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.recoveryShowcase.back })).toHaveAttribute(
      'href',
      '/login',
    );
    const email = screen.getByLabelText(t.recovery.email, { exact: false });
    expect(email).toHaveAttribute('aria-required', 'true');
    expect(email).toHaveAttribute('dir', 'ltr');
    await userEvent.click(screen.getByRole('button', { name: t.recoveryShowcase.submit }));
    expect(await screen.findByText(t.validation.emailInvalid)).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription(t.validation.emailInvalid);
    expect(email).toHaveFocus();
    expect(mocks.request).not.toHaveBeenCalled();
    await userEvent.type(email, ' person@example.test ');
    await userEvent.click(screen.getByRole('button', { name: t.recoveryShowcase.submit }));
    expect(await screen.findByRole('status')).toHaveTextContent(t.recovery.confirmation);
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/recovery', {
      method: 'POST',
      body: JSON.stringify({ email: 'person@example.test' }),
    });
    expect(screen.queryByText('person@example.test')).not.toBeInTheDocument();
  },
);

it('keeps recovery failures generic and restores focus in Arabic', async () => {
  mocks.request.mockRejectedValue(new Error('private-provider-details'));
  const t = getCatalog('ar');
  mount('ar');
  const email = screen.getByLabelText(t.recovery.email, { exact: false });
  await userEvent.type(email, 'person@example.test');
  await userEvent.click(screen.getByRole('button', { name: t.recoveryShowcase.submit }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.recovery.unavailable);
  expect(screen.queryByText('private-provider-details')).not.toBeInTheDocument();
  expect(email).toHaveFocus();
});

it('announces pending submission and prevents duplicate recovery requests', async () => {
  let complete!: () => void;
  mocks.request.mockImplementation(
    () =>
      new Promise<void>((done) => {
        complete = done;
      }),
  );
  const t = getCatalog('en');
  mount();
  await userEvent.type(
    screen.getByLabelText(t.recovery.email, { exact: false }),
    'person@example.test',
  );
  await userEvent.dblClick(screen.getByRole('button', { name: t.recoveryShowcase.submit }));
  expect(screen.getByRole('button', { name: t.recovery.pending })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(t.recovery.pending);
  expect(mocks.request).toHaveBeenCalledOnce();
  await act(async () => complete());
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(t.recovery.confirmation),
  );
});
