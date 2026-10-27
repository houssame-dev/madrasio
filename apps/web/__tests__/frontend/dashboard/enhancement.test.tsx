import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { Dashboard } from '@/components/app/dashboard';
import { AppContextProvider } from '@/components/app/app-context';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { getCatalog } from '@/i18n/catalogs';
import type { Role } from '@/lib/authorization/roles';
import { visibleNavigationItems } from '@/lib/frontend/navigation';
import { schoolId, otherSchoolId, userId, successfulDashboardFetch } from './test-helpers';

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

function show(role: Role, locale: SupportedLocale, shortcutsOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    <QueryClientProvider client={client}><AppContextProvider value={{
      user: { id: userId }, currentSchool: { id: schoolId, role, timezone: 'Africa/Casablanca' },
      memberships: [{ schoolId, schoolName: 'Atlas مدرسة', role, status: 'ACTIVE' }],
    }}><div dir={locale === 'ar' ? 'rtl' : 'ltr'}>{shortcutsOnly ? <><DashboardActions workflows="school" /><DashboardActions workflows="teaching" /><DashboardActions workflows="family" /></> : <Dashboard />}</div></AppContextProvider></QueryClientProvider>
  </NextIntlClientProvider>);
}

it.each(['en', 'fr', 'ar'] as const)('provides localized Admin overview and keyboard links in %s through scoped reads', async locale => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input) === '/api/v1/dashboard' ? Response.json({ data: { date: '2026-10-24', timezone: 'Africa/Casablanca', years: [], academicYear: null, selectedYear: null, metrics: null, lessons: [] } }) : Response.json({data:[],meta:{total:0,page:1,pageSize:4}}));
  const view = show('SCHOOL_ADMIN', locale);
  const catalog = getCatalog(locale);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(catalog.application.title);
  expect(screen.getByRole('heading', { name: catalog.application.recentAnnouncements })).toBeInTheDocument();
  expect(await screen.findByText('Africa/Casablanca')).toBeInTheDocument();
  expect(view.container.firstChild).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await userEvent.tab();
  expect(screen.getAllByRole('link')[0]).toHaveFocus();
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes('schoolId=') && !String(url).includes('userId='))).toBe(true);
});

it.each(['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'SUPER_ADMIN'] as const)('never exposes a shortcut outside the existing navigation scope for %s', role => {
  show(role, 'en', true);
  const allowed = visibleNavigationItems(role).map(item => item.href);
  for (const link of screen.getAllByRole('link')) expect(allowed).toContain(link.getAttribute('href'));
  if (role !== 'SCHOOL_ADMIN') expect(screen.queryByRole('link', { name: /^Finance/ })).not.toBeInTheDocument();
  if (role === 'PARENT') {
    expect(screen.queryByRole('link', { name: /^Grades/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Attendance/ })).not.toBeInTheDocument();
  }
});

it.each(['en', 'fr', 'ar'] as const)('keeps Teacher tasks, scoped assignments and real counts in %s', async locale => {
  const fetcher = successfulDashboardFetch();
  show('TEACHER', locale);
  const catalog = getCatalog(locale);
  await screen.findByRole('heading', { name: catalog.teacherWorkspace.classes });
  expect(screen.getAllByRole('link', { name: new RegExp('^' + catalog.navigation.items.timetable) })[0]).toHaveAttribute('href', '/timetable');
  expect(screen.getByRole('heading', { name: '1A' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Finance/ })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes('schoolId=') && !String(url).includes('userId='))).toBe(true);
});

it.each(['en', 'fr', 'ar'] as const)('keeps Parent Results child-scoped and adds published timetable and school news in %s', async locale => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input) === '/api/v1/me/parent-profiles') return Response.json({ data: [{ parent: { id: 'parent' }, children: [{ student: { id: 'child-one', firstName: 'Nora', lastName: 'Test', studentCode: 'S1' } }] }] });
    if (String(input) === '/api/v1/notifications/unread-count') return Response.json({ data: { count: 2 } });
    if (String(input).endsWith('/academic-years') || String(input).includes('/me/announcements') || String(input).includes('/notifications?')) return Response.json({ data: [] });
    throw new Error('Unexpected Parent dashboard request');
  });
  show('PARENT', locale);
  await screen.findByRole('heading', { name: 'Nora Test' });
  expect(screen.getByRole('link', { name: getCatalog(locale).parentWorkspace.profile })).toHaveAttribute('href', '/children/child-one');
  expect(screen.getByRole('heading', { name: getCatalog(locale).parentWorkspace.announcements }).parentElement!.querySelector('a')).toHaveAttribute('href', '/announcements/inbox');
  expect(screen.queryByRole('link', { name: new RegExp('^' + getCatalog(locale).navigation.items.schoolAnnouncements) })).not.toBeInTheDocument();
  expect(screen.queryByText('Other child')).not.toBeInTheDocument();
});

it('keeps cached Parent children separate for different School contexts', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  let activeSchool = schoolId;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input) === '/api/v1/notifications/unread-count'
    ? Response.json({ data: { count: 0 } })
    : String(input) !== '/api/v1/me/parent-profiles' ? Response.json({data:[]}) : Response.json({ data: [{ parent: { id: 'parent' }, children: [{ student: { id: activeSchool, firstName: activeSchool === schoolId ? 'First' : 'Second', lastName: 'Child', studentCode: null } }] }] }));
  function School({ id }: { id: string }) {
    return <NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id, role: 'PARENT', timezone: 'UTC' }, memberships: [] }}><Dashboard /></AppContextProvider></QueryClientProvider></NextIntlClientProvider>;
  }
  const view = render(<School id={schoolId} />);
  await screen.findByRole('heading', { name: 'First Child' });
  activeSchool = otherSchoolId; view.rerender(<School id={otherSchoolId} />);
  expect(screen.queryByRole('heading', { name: 'First Child' })).not.toBeInTheDocument();
  await screen.findByRole('heading', { name: 'Second Child' });
  expect(screen.queryByRole('link', { name: /First Child/ })).not.toBeInTheDocument();
});
