import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { SupportedLocale } from '@school/shared';
import type { Role } from '@/lib/authorization/roles';
import { AppContextProvider } from '@/components/app/app-context';
import { TimetableWorkspace } from '@/components/timetable/workspace';
import { getCatalog } from '@/i18n/catalogs';
import { builderFixture, savedFixture, tid } from './builder-fixture';
import { publishedFixture } from './publication-fixture';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
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
function show(locale: SupportedLocale = 'en', role: Role = 'SCHOOL_ADMIN') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: tid(14) }, currentSchool: { id: tid(1), role, timezone: 'Africa/Casablanca' }, memberships: [] }}><TimetableWorkspace /></AppContextProvider></QueryClientProvider></NextIntlClientProvider>);
}
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
