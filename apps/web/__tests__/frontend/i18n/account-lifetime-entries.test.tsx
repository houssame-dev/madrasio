import { AccountLifetimeProvider } from '@/components/language/account-lifetime-host';
import { cleanup, render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { AppBootstrap } from '@/components/app/app-bootstrap';
import { getCatalog } from '@/i18n/catalogs';
import type { MeResponseDto } from '@/lib/api/me';
import type { AccountLifetime } from '@/lib/frontend/language/controller';
import type { AccountAuthListener } from '@/lib/frontend/language/auth-events';

const mocks = vi.hoisted(() => ({ observed: vi.fn<(value: AccountLifetime | null) => void>() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/dashboard' }));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth: {
  onAuthStateChange(listener: AccountAuthListener) {
    listener('INITIAL_SESSION', { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-15T00:00:00Z' } });
    return { data: { subscription: { unsubscribe() {} } } };
  },
} }) }));
// Only the inactive placement marker is substituted with a future consumer.
// This proves the actual entry's host coverage, not selector activation.
vi.mock('@/components/language/preference-slot', async () => {
  const { useEffect } = await import('react');
  const { useVerifiedAccountLifetime } = await import('@/components/language/account-lifetime-host');
  return { LanguagePreferenceSlot: function Probe() {
    const { lifetime } = useVerifiedAccountLifetime();
    useEffect(() => mocks.observed(lifetime), [lifetime]);
    return null;
  } };
});
const userId = '00000000-0000-4000-8000-000000000801';
const schoolId = '00000000-0000-4000-8000-000000000802';
const membership = { schoolId, schoolName: 'Original School', role: 'SCHOOL_ADMIN' as const, status: 'ACTIVE' as const };
const cases: [string, MeResponseDto][] = [
  ['school', { user: { id: userId }, currentSchool: { id: schoolId, role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [membership] }],
  ['school-selection', { user: { id: userId }, currentSchool: null, memberships: [membership] }],
  ['no-school', { user: { id: userId }, currentSchool: null, memberships: [] }],
  ['platform-only', { user: { id: userId }, currentSchool: null, memberships: [], platformAuthority: 'SUPER_ADMIN' }],
];
afterEach(() => { cleanup(); vi.restoreAllMocks(); mocks.observed.mockReset(); });
it.each(cases)('provides verified, membership-independent operation ownership for the actual %s bootstrap branch', async (_name, dto) => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) === '/api/v1/me') return Response.json({ data: dto });
    if (String(input) === '/api/v1/notifications/unread-count') return Response.json({ data: { count: 0 } });
    if (String(input) === '/api/v1/dashboard/context') return Response.json({ data: { date: '2026-10-24', timezone: 'UTC', academicYear: null } });
    throw new Error('Unexpected synthetic resource');
  });
  render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><Providers><AccountLifetimeProvider><AppBootstrap><p>Original child</p></AppBootstrap></AccountLifetimeProvider></Providers></NextIntlClientProvider>);
  if (_name === 'school') await userEvent.click(await screen.findByRole('button', { name: getCatalog('en').application.profile }));
  await waitFor(() => expect(mocks.observed.mock.lastCall?.[0]?.isCurrent()).toBe(true));
  expect(mocks.observed.mock.lastCall?.[0]?.userId).toBe(userId);
  expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/language'))).toBe(false);
});
