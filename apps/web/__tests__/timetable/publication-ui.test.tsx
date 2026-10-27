import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { SupportedLocale } from '@school/shared';
import type { Role } from '@/lib/authorization/roles';
import { AppContextProvider } from '@/components/app/app-context';
import { TimetableWorkspace } from '@/components/timetable/workspace';
import { PublishedTimetables } from '@/components/timetable/publication';
import { getCatalog } from '@/i18n/catalogs';
import { builderFixture, savedFixture, tid } from './builder-fixture';
import { publishedFixture } from './publication-fixture';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
const fetcher = vi.fn<typeof fetch>(), clients: QueryClient[] = [];
let fixture: ReturnType<typeof builderFixture>, published: ReturnType<typeof publishedFixture>;
beforeEach(() => {
  fixture = builderFixture(); published = publishedFixture(); published.latestSequence = 0; published.latestEffectiveFrom = null; published.history = []; published.schedules = [];
  fixture.draft = savedFixture(fixture.draft, { academicYearId: tid(2), academicPeriodId: tid(3), classId: tid(4), configurationId: tid(12), curriculumVersionId: tid(7), startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: 0, requestKey: tid(60), lessons: publishedFixture().schedules[0].lessons.map(({ lessonKey, weekday, start, end, subjectId, teacherAssignmentId, roomId }) => ({ lessonKey, weekday, start, end, subjectId, teacherAssignmentId, roomId })) });
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); fetcher.mockImplementation(async (url, options) => {
    if (String(url).includes('/published')) { if (options?.method === 'POST') { published = publishedFixture(); return Response.json({ data: { id: tid(80), sequence: 1 } }); } return Response.json({ data: published }); }
    return Response.json({ data: String(url).includes('/draft') ? fixture.draft : fixture.state });
  });
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function show(locale: SupportedLocale = 'en', role: Role = 'SCHOOL_ADMIN', publishedOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: tid(14) }, currentSchool: { id: tid(1), role, timezone: 'Africa/Casablanca' }, memberships: [] }}><div dir={locale === 'ar' ? 'rtl' : 'ltr'}>{publishedOnly ? <PublishedTimetables /> : <TimetableWorkspace />}</div></AppContextProvider></QueryClientProvider></NextIntlClientProvider>);
}
function mixedClasses() {
  published = publishedFixture(); published.history = [];
  const first = published.schedules[0], lesson = first.lessons[0];
  first.lessons = [
    { ...lesson, start: '10:00', end: '11:00' },
    { ...lesson, lessonKey: tid(71), weekday: 2, start: '07:00', end: '08:00', subjectName: 'Tuesday subject' },
    { ...lesson, lessonKey: tid(72), weekday: 7, subjectName: 'Sunday subject' },
  ];
  published.schedules.push({ ...first, id: tid(81), classId: tid(5), className: 'Class B', lessons: [
    { ...lesson, lessonKey: tid(73), start: '09:00', end: '10:00', subjectName: 'Science', roomName: null, roomId: null },
    // Reuse a lesson key in another publication: the rendered identity includes the publication.
    { ...lesson, start: '08:00', end: '09:00', subjectName: 'French' },
  ] });
}
function expectDayOrder(locale: SupportedLocale) {
  const t = getCatalog(locale).timetablePublication, week = getCatalog(locale).timetable;
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([week.monday, week.tuesday, week.sunday]);
  const monday = within(screen.getByRole('region', { name: week.monday }));
  const rows = monday.getAllByRole('listitem');
  expect(rows.map(row => within(row).getByText(/\d{2}:\d{2}–\d{2}:\d{2}/).textContent)).toEqual(['08:00–09:00', '09:00–10:00', '10:00–11:00']);
  expect(rows.map(row => within(row).getByText(/Class [AB]/).textContent)).toEqual(['Class B', 'Class B', 'Class A']);
  expect(rows.map(row => within(row).getByText(/^(French|Science|Math)$/).textContent)).toEqual(['French', 'Science', 'Math']);
  expect(within(rows[0]).getByText('Lab')).toBeInTheDocument();
  expect(within(rows[1]).getByText(t.noRoom)).toBeInTheDocument();
  expect(within(rows[0]).getByText('08:00–09:00')).toHaveAttribute('dir', 'ltr');
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
}
it.each<SupportedLocale>(['en', 'fr', 'ar'])('merges the Teacher authorized classes into chronological working days in %s', async locale => {
  mixedClasses(); published.role = 'TEACHER'; const before = structuredClone(published.schedules);
  const view = show(locale, 'TEACHER', true);
  await screen.findByText('Science'); expectDayOrder(locale);
  expect(view.container.firstChild).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(screen.queryByLabelText(getCatalog(locale).timetablePublication.view)).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url, options]) => String(url).startsWith('/api/v1/timetable/published?') && !options?.method)).toBe(true);
  expect(published.schedules).toEqual(before);
});
it.each<SupportedLocale>(['en', 'fr', 'ar'])('uses day-first Admin Teacher mode and preserves the existing Teacher filter in %s', async locale => {
  mixedClasses(); const user = userEvent.setup(), t = getCatalog(locale).timetablePublication;
  show(locale, 'SCHOOL_ADMIN', true); await screen.findByText('Science');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  await user.selectOptions(screen.getByLabelText(t.view), 'TEACHER'); expectDayOrder(locale);
  for (const row of screen.getAllByRole('listitem')) expect(within(row).getByText('Amina Test')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText(t.teacher), tid(9));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes(`teacherId=${tid(9)}`))).toBe(true));
  await user.selectOptions(screen.getByLabelText(t.view), 'CLASS');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.queryByLabelText(t.teacher)).not.toBeInTheDocument();
});
it.each(['SCHOOL_ADMIN', 'PARENT'] as const)('retains class-based published cards for %s', async role => {
  published = publishedFixture(role); published.history = [];
  show('en', role, true); await screen.findByText('Math');
  expect(screen.getByRole('article')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Class A · Term 1 · 2025/26' })).toBeInTheDocument();
  expect(role==='SCHOOL_ADMIN'?screen.getByRole('columnheader',{name:'Monday'}):screen.getByRole('heading', { level: 4, name: 'Monday' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 2, name: 'Monday' })).not.toBeInTheDocument();
});
it.each<SupportedLocale>(['en', 'fr', 'ar'])('explicitly confirms publication despite understandable incomplete load warnings in %s', async locale => {
  const t = getCatalog(locale).timetablePublication, builder = getCatalog(locale).timetableBuilder, user = userEvent.setup(); show(locale);
  await user.click(await screen.findByRole('button', { name: builder.title })); const publishButton = await screen.findByRole('button', { name: t.publish }); await waitFor(() => expect(publishButton).toBeEnabled()); await user.click(publishButton);
  const modal = within(screen.getByRole('dialog')); expect(modal.getByText(t.warnings)).toBeInTheDocument(); expect(fetcher.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  await user.click(modal.getByRole('button', { name: t.confirm })); await screen.findByText(t.saved);
  const call = fetcher.mock.calls.find(([, o]) => o?.method === 'POST')!; expect(JSON.parse(String(call[1]?.body))).toMatchObject({ confirm: true, expectedRevision: 1, expectedSequence: 0, effectiveFrom: '2025-09-01' });
});
it.each<Exclude<Role, 'SUPER_ADMIN'>>(['TEACHER', 'PARENT'])('renders only published role content for %s and never fetches drafts', async role => {
  published = publishedFixture(role); const user = userEvent.setup(); show('en', role); await screen.findByText('Math'); expect(screen.queryByRole('button', { name: getCatalog('en').timetablePublication.publish })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url]) => String(url).includes('/published'))).toBe(true);
  if (role === 'PARENT') { await user.selectOptions(screen.getByLabelText(getCatalog('en').timetablePublication.child), tid(38)); expect(fetcher.mock.calls.some(([url]) => String(url).includes(`studentId=${tid(38)}`))).toBe(true); }
});
it('explicitly warns before publishing an empty replacement and uses the latest publication sequence', async () => {
  published = publishedFixture(); fixture.draft.lessons = [];
  const t = getCatalog('en').timetablePublication, user = userEvent.setup(); show();
  await user.click(await screen.findByRole('button', { name: getCatalog('en').timetableBuilder.title }));
  const button = await screen.findByRole('button', { name: t.publish }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  const modal = within(screen.getByRole('dialog')); expect(modal.getByRole('alert')).toHaveTextContent(t.emptyReplacement);
  await user.click(modal.getByRole('button', { name: t.confirm })); await screen.findByText(t.saved);
  const call = fetcher.mock.calls.find(([, o]) => o?.method === 'POST')!; expect(JSON.parse(String(call[1]?.body))).toMatchObject({ expectedSequence: 1, effectiveFrom: '2025-09-02', confirm: true });
});


it.each<SupportedLocale>(['en', 'fr', 'ar'])('filters the day-first Teacher week without altering the published data in %s', async locale => {
  mixedClasses(); published.role = 'TEACHER'; const before = structuredClone(published.schedules);
  show(locale, 'TEACHER', true); await screen.findByText('Science');
  const ui = getCatalog(locale).timetableUi, week = getCatalog(locale).timetable;
  const day = screen.getByLabelText(ui.day); day.focus(); expect(day).toHaveFocus();
  await userEvent.selectOptions(day, '2');
  expect(screen.getByRole('heading', { level: 2, name: week.tuesday })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: week.monday })).not.toBeInTheDocument();
  await userEvent.selectOptions(day, '3');
  expect(screen.getByRole('status')).toHaveTextContent(ui.noLessonsForDay);
  await userEvent.selectOptions(day, '0'); expectDayOrder(locale);
  expect(published.schedules).toEqual(before);
  expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('uses the server calendar date for Today instead of the browser date', async () => {
  mixedClasses(); published.role = 'TEACHER'; published.date = '2025-09-02';
  show('en', 'TEACHER', true); await screen.findByText('Science');
  await userEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByLabelText('Day')).toHaveValue('1');
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('date=2025-09-01'))).toBe(true));
  expect(screen.getByRole('heading', { level: 2, name: 'Monday' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Tuesday' })).not.toBeInTheDocument();
});
it('identifies the server-selected child and never shows another child’s cached lessons after selection', async () => {
  published = publishedFixture('PARENT');
  fetcher.mockImplementation(async input => {
    const second = String(input).includes(`studentId=${tid(38)}`);
    return Response.json({ data: { ...published, selectedStudentId: second ? tid(38) : tid(37), schedules: published.schedules.map(schedule => ({ ...schedule, lessons: schedule.lessons.map(lesson => ({ ...lesson, subjectName: second ? 'Second child subject' : 'First child subject' })) })) } });
  });
  show('en', 'PARENT', true); await screen.findByText('Schedule for Child One');
  await userEvent.selectOptions(screen.getByLabelText('Child'), tid(38));
  await screen.findByText('Schedule for Child Two');
  expect(screen.queryByText('First child subject')).not.toBeInTheDocument();
  expect(screen.getByText('Second child subject')).toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url]) => String(url).includes('/timetable/published'))).toBe(true);
});
it('keeps a single page heading when Admin opens embedded published schedules', async () => {
  published = publishedFixture(); show();
  await userEvent.click(await screen.findByRole('button', { name: getCatalog('en').timetable.published }));
  await screen.findByRole('heading', { level: 2, name: 'Published timetables' });
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 2, name: 'Published timetables' })).toBeInTheDocument();
});
