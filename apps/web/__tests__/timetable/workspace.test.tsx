import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { SupportedLocale } from '@school/shared';
import type { Role } from '@/lib/authorization/roles';
import { AppContextProvider } from '@/components/app/app-context';
import { getCatalog } from '@/i18n/catalogs';
import { TimetableWorkspace } from '@/components/timetable/workspace';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const fetcher = vi.fn<typeof fetch>(); const clients: QueryClient[] = [];
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const state = { years: [{ id: id(1), name: '2026/27', status: 'ACTIVE', startDate: '2026-09-01', endDate: '2027-07-01' }], selectedYearId: id(1), stages: [{ id: id(2), name: 'Primary', status: 'ACTIVE' }], levels: [{ id: id(3), name: 'Level 1', stageId: id(2), status: 'ACTIVE' }], rooms: [], configurations: [], loads: [], classes: [{ id: id(4), name: '1A', levelId: id(3), curriculumVersionId: id(5), status: 'ACTIVE' }], subjects: [{ id: id(6), name: 'Math', status: 'ACTIVE' }], curriculumSubjects: [{ subjectId: id(6), curriculumVersionId: id(5), status: 'ACTIVE' }], assignments: [{ assignment: { id: id(7), classId: id(4), subjectId: id(6), status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveUntil: null }, teacherFirstName: 'Amina', teacherName: 'Test', teacherStatus: 'ACTIVE' }], effective: [{ classId: id(4), configurationId: null }] };
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher); fetcher.mockImplementation(async () => Response.json({ data: state })); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function show(locale: SupportedLocale = 'en', role: Role = 'SCHOOL_ADMIN') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: 'admin' }, currentSchool: { id: 'school', role, timezone: 'Africa/Casablanca' }, memberships: [] }}><div dir={locale === 'ar' ? 'rtl' : 'ltr'}><TimetableWorkspace /></div></AppContextProvider></QueryClientProvider></NextIntlClientProvider>);
}
it.each<SupportedLocale>(['en', 'fr', 'ar'])('renders and saves a localized teaching week and room in %s', async locale => {
  const t = getCatalog(locale).timetable, user = userEvent.setup(), view = show(locale);
  await screen.findByRole('heading', { name: t.title }); expect(view.container.firstElementChild).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(screen.getByLabelText(t.monday)).toBeChecked(); expect(screen.getByLabelText(t.saturday)).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(fetcher.mock.calls.some(([p]) => String(p).endsWith('/configurations'))).toBe(true));
  const config = fetcher.mock.calls.find(([p]) => String(p).endsWith('/configurations'))!;
  expect(JSON.parse(String(config[1]?.body))).toMatchObject({ academicYearId: id(1), expectedRevision: 0, days: expect.arrayContaining([{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }]) });
  await user.click(screen.getByRole('button', { name: t.rooms }));
  await user.type(screen.getByLabelText(t.name), 'Science lab'); await user.selectOptions(screen.getByLabelText(t.kind), 'LAB');
  await user.click(screen.getByRole('button', { name: t.addRoom }));
  await waitFor(() => expect(fetcher.mock.calls.some(([p]) => String(p).endsWith('/rooms'))).toBe(true));
  const call = fetcher.mock.calls.find(([p]) => String(p).endsWith('/rooms'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ name: 'Science lab', kind: 'LAB', active: true, expectedRevision: 0 });
});
it('saves Class/Subject load with an existing assignment and optional room', async () => {
  const t = getCatalog('en').timetable, user = userEvent.setup(); show(); await screen.findByRole('heading', { name: t.title });
  await user.click(screen.getByRole('button', { name: t.loads })); await user.selectOptions(screen.getByLabelText(t.subject), id(6));
  await user.selectOptions(screen.getByLabelText(t.assignment), id(7)); fireEvent.change(screen.getByLabelText(t.lessons), { target: { value: '4' } });
  await user.click(screen.getByRole('button', { name: t.addLoad }));
  await waitFor(() => expect(fetcher.mock.calls.some(([p]) => String(p).endsWith('/loads'))).toBe(true));
  const call = fetcher.mock.calls.find(([p]) => String(p).endsWith('/loads'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ academicYearId: id(1), classId: id(4), subjectId: id(6), teacherAssignmentId: id(7), roomId: null, lessonsPerWeek: 4, durationMinutes: 60, expectedRevision: 0, enabled: true });
});
it('rejects overlapping intervals before sending writes', async () => {
  const user = userEvent.setup(); show(); await screen.findByRole('heading', { name: 'Timetable' });
  fireEvent.change(screen.getAllByLabelText('End time')[0], { target: { value: '07:00' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(getCatalog('en').timetable.invalid);
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0);
});
it('shows closed years as read-only and failed requests with retry', async () => {
  fetcher.mockImplementation(async () => Response.json({ data: { ...state, years: [{ ...state.years[0], status: 'CLOSED' }] } }));
  show(); await screen.findByRole('heading', { name: 'Timetable' }); expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); cleanup();
  fetcher.mockRejectedValue(new Error('synthetic')); show(); expect(await screen.findByRole('alert')).toHaveTextContent(getCatalog('en').timetable.error); expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
});
it.each<Role>(['TEACHER', 'PARENT'])('fetches only published data and does not expose settings for %s', async role => {
  fetcher.mockImplementation(async () => Response.json({ data: { date: '2026-10-19', today: '2026-10-19', children: [], schedules: [], history: [], classes: [], teachers: [] } }));
  show('en', role); await screen.findByText(getCatalog('en').timetablePublication.empty);
  expect(fetcher.mock.calls.every(([url]) => String(url).includes('/timetable/published'))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});
it('does not fetch or expose timetables for platform-only authority', () => { show('en', 'SUPER_ADMIN'); expect(fetcher).not.toHaveBeenCalled(); });
