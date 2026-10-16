import { AccountLifetimeProvider } from '@/components/language/account-lifetime-host';
import { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { AuthenticatedAccountLifetimeHost, useVerifiedAccountLifetime } from '@/components/language/account-lifetime-host';
import { LoginForm } from '@/components/auth/login-form';
import { LogoutButton } from '@/components/auth/logout-button';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import type { AccountLifetime } from '@/lib/frontend/language/controller';
import type { AccountAuthListener } from '@/lib/frontend/language/auth-events';
import type { Session } from '@supabase/supabase-js';
import { getCatalog } from '@/i18n/catalogs';

const mocks = vi.hoisted(() => ({ logout: vi.fn(), login: vi.fn(), update: vi.fn(), navigate: vi.fn(), replace: vi.fn(), refresh: vi.fn(), client: vi.fn(),
  subscribe: vi.fn<(listener: AccountAuthListener) => { data: { subscription: { unsubscribe(): void } } }>(), unsubscribe: vi.fn() }));
vi.mock('@/lib/frontend/auth/api', () => ({ postLogout: mocks.logout }));
vi.mock('@/lib/frontend/language/auth-navigation', () => ({ navigateAfterAuth: mocks.navigate }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: () => { mocks.client(); return { auth: { signInWithPassword: mocks.login, updateUser: mocks.update, onAuthStateChange: mocks.subscribe } }; },
}));
const userId = '00000000-0000-4000-8000-000000000801';
const syntheticSession = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-15T00:00:00Z' } } satisfies Session;
function Probe({ observe }: { observe: (lifetime: AccountLifetime | null) => void }) {
  const { lifetime, reverify } = useVerifiedAccountLifetime();
  useEffect(() => observe(lifetime), [lifetime, observe]);
  return <button type="button" onClick={reverify}>Reverify test ownership</button>;
}
function CacheObservation() {
  const client = useQueryClient();
  return <button type="button" onClick={() => client.setQueryData(['me'], {
    user: { id: '00000000-0000-4000-8000-000000000899' },
  })}>Observe different cached identity</button>;
}
function wrap(ui: React.ReactNode, observe: (lifetime: AccountLifetime | null) => void) {
  return render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">
    <Providers><AccountLifetimeProvider><AuthenticatedAccountLifetimeHost verifiedUserId={userId}><Probe observe={observe} />{ui}</AuthenticatedAccountLifetimeHost></AccountLifetimeProvider></Providers>
  </NextIntlClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.logout.mockResolvedValue(undefined); mocks.login.mockResolvedValue({ error: null }); mocks.update.mockResolvedValue({ error: null });
  mocks.subscribe.mockImplementation((listener) => {
    listener('INITIAL_SESSION', syntheticSession);
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: { user: { id: userId } } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('real local Auth UI invalidation before existing Auth calls', () => {
  it('revokes through the actual consumer subscription and unsubscribes on unmount', async () => {
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); const view = wrap(<p>Original content</p>, observe);
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    const lifetime = observe.mock.lastCall?.[0];
    const listener = mocks.subscribe.mock.lastCall?.[0];
    if (!listener) throw new Error('Expected Auth subscription');
    act(() => listener('SIGNED_OUT', null));
    expect(lifetime?.isCurrent()).toBe(false); expect(observe.mock.lastCall?.[0]).toBeNull();
    view.unmount(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    act(() => listener('SIGNED_IN', syntheticSession));
    expect(lifetime?.isCurrent()).toBe(false);
  });
  it('does not initialize the Auth SDK or read /me when the provider has no language consumer', async () => {
    render(<Providers><AccountLifetimeProvider><p>No consumer</p></AccountLifetimeProvider></Providers>);
    await act(async () => {});
    expect(globalThis.fetch).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it('revokes before the canonical logout request while preserving its URL/router behavior', async () => {
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); wrap(<LogoutButton />, observe);
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    const lifetime = observe.mock.lastCall?.[0];
    mocks.logout.mockImplementation(async () => { expect(lifetime?.isCurrent()).toBe(false); });
    await userEvent.click(screen.getByRole('button', { name: getCatalog('en').auth.logout }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(lifetime?.isCurrent()).toBe(false);
    expect(mocks.logout).toHaveBeenCalledWith();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login'));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('revokes before signInWithPassword and never treats client login success as verified identity', async () => {
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); wrap(<LoginForm />, observe);
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    const lifetime = observe.mock.lastCall?.[0];
    mocks.login.mockImplementation(async () => { expect(lifetime?.isCurrent()).toBe(false); return { error: null }; });
    await userEvent.type(screen.getByLabelText(getCatalog('en').auth.email), 'synthetic@example.test');
    await userEvent.type(screen.getByLabelText(getCatalog('en').auth.password), 'SyntheticPassword123!');
    await userEvent.click(screen.getByRole('button', { name: getCatalog('en').auth.submit }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledOnce());
    expect(lifetime?.isCurrent()).toBe(false); expect(observe.mock.lastCall?.[0]).toBeNull();
    expect(mocks.login).toHaveBeenCalledWith({ email: 'synthetic@example.test', password: 'SyntheticPassword123!' });
    await userEvent.click(screen.getByRole('button', { name: 'Reverify test ownership' }));
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    expect(observe.mock.lastCall?.[0]).not.toBe(lifetime);
  });
  it('invalidates before password/recovery completion without changing the SDK update payload', async () => {
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); wrap(<SetPasswordForm />, observe);
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    const lifetime = observe.mock.lastCall?.[0];
    mocks.update.mockImplementation(async () => { expect(lifetime?.isCurrent()).toBe(false); return { error: null }; });
    await userEvent.type(screen.getByLabelText(getCatalog('en').password.newPassword), 'SyntheticPassword123!');
    await userEvent.type(screen.getByLabelText(getCatalog('en').password.confirmation), 'SyntheticPassword123!');
    await userEvent.click(screen.getByRole('button', { name: getCatalog('en').password.submit }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: 'SyntheticPassword123!' }));
    expect(lifetime?.isCurrent()).toBe(false);
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
  });
  it('cancels pending /me verification on unmount and ignores a late response', async () => {
    let finish: (value: Response) => void = () => {};
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); const view = wrap(<p>Original content</p>, observe);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(globalThis.fetch).mock.calls[0][1]?.signal;
    view.unmount(); expect(signal?.aborted).toBe(true);
    await act(async () => { finish(Response.json({ data: { user: { id: userId } } })); });
    expect(observe.mock.calls.every(([value]) => value === null)).toBe(true);
  });
  it('revokes on a changed /me cache observation without trusting it to establish another identity', async () => {
    const observe = vi.fn<(value: AccountLifetime | null) => void>(); wrap(<CacheObservation />, observe);
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    const old = observe.mock.lastCall?.[0];
    await userEvent.click(screen.getByRole('button', { name: 'Observe different cached identity' }));
    expect(old?.isCurrent()).toBe(false); expect(observe.mock.lastCall?.[0]).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reverify test ownership' }));
    await waitFor(() => expect(observe.mock.lastCall?.[0]?.isCurrent()).toBe(true));
    expect(observe.mock.lastCall?.[0]?.userId).toBe(userId);
    expect(observe.mock.lastCall?.[0]).not.toBe(old);
  });
});
