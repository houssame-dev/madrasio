import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { SupportedLocale } from '@school/shared';
import { AppContextProvider } from '@/components/app/app-context';
import { TimetableWorkspace } from '@/components/timetable/workspace';
import { getCatalog } from '@/i18n/catalogs';
import { draftSchema } from '@/lib/modules/timetable/domain/builder';
import { builderFixture, savedFixture, tid } from './builder-fixture';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const fetcher = vi.fn<typeof fetch>(), clients: QueryClient[] = [];
let fixture: ReturnType<typeof builderFixture>;
beforeEach(() => {
  fixture = builderFixture(); fetcher.mockReset(); vi.stubGlobal('fetch', fetcher);
  fetcher.mockImplementation(async (path, options) => {
    if (String(path).includes('/draft')) {
      if (options?.method === 'PUT') fixture.draft = savedFixture(fixture.draft, draftSchema.parse(JSON.parse(String(options.body))));
      return Response.json({ data: fixture.draft });
    }
    return Response.json({ data: fixture.state });
  });
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function show(locale: SupportedLocale = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><QueryClientProvider client={client}><AppContextProvider value={{ user: { id: tid(14) }, currentSchool: { id: tid(1), role: 'SCHOOL_ADMIN', timezone: 'Africa/Casablanca' }, memberships: [] }}><div dir={locale === 'ar' ? 'rtl' : 'ltr'}><TimetableWorkspace /></div></AppContextProvider></QueryClientProvider></NextIntlClientProvider>);
}
async function open(locale: SupportedLocale = 'en') { const user = userEvent.setup(), t = getCatalog(locale).timetableBuilder; show(locale); await user.click(await screen.findByRole('button', { name: t.title })); await screen.findByRole('region', { name: t.grid }); return { user, t }; }
async function add(user: ReturnType<typeof userEvent.setup>, t: ReturnType<typeof getCatalog>['timetableBuilder']) {
  await user.click(screen.getAllByRole('button', { name: new RegExp(t.add) })[0]); const modal = within(screen.getByRole('dialog'));
  await user.selectOptions(modal.getByLabelText(t.subject), tid(8)); await user.selectOptions(modal.getByLabelText(t.assignment), tid(10)); await user.selectOptions(modal.getByLabelText(t.room), tid(11)); await user.click(modal.getByRole('button', { name: t.apply }));
}
it.each<SupportedLocale>(['en', 'fr', 'ar'])('adds and persists an incomplete draft with localized progress in %s', async locale => {
  const { user, t } = await open(locale); await add(user, t);
  expect(screen.getByText(t.INCOMPLETE)).toBeInTheDocument(); expect(screen.getByRole('button', { name: t.save })).toBeEnabled();
  expect(screen.getByLabelText(t.period)).toBeDisabled(); expect(screen.getByLabelText(getCatalog(locale).timetable.year)).toBeDisabled();
  await user.click(screen.getByRole('button', { name: t.save })); await screen.findByText(t.saved);
  expect(fixture.draft.lessons).toHaveLength(1); expect(fixture.draft.draft?.revision).toBe(1);
  const put = fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')!;
  expect(draftSchema.parse(JSON.parse(String(put[1]?.body)))).toMatchObject({ expectedRevision: 0, configurationId: tid(12), lessons: [expect.objectContaining({ subjectId: tid(8), roomId: tid(11) })] });
  expect(within(screen.getByRole('region', { name: t.grid })).getByText('Math')).toBeInTheDocument();
});
it('edits, moves and removes a lesson without changing its stable identity', async () => {
  const { user, t } = await open(); await add(user, t); await user.click(screen.getByRole('button', { name: t.save })); await screen.findByText(t.saved);
  const original = { ...fixture.draft.lessons[0] };
  await user.click(screen.getByRole('button', { name: new RegExp(t.edit) })); const modal = within(screen.getByRole('dialog'));
  await user.selectOptions(modal.getByLabelText(t.slot), '2|08:00|09:00'); await user.click(modal.getByRole('button', { name: t.apply }));
  await user.click(screen.getByRole('button', { name: t.save })); await screen.findByText(t.saved);
  expect(fixture.draft.lessons[0]).toMatchObject({ lessonKey: original.lessonKey, weekday: 2 }); expect(original.weekday).toBe(1);
  await user.click(screen.getByRole('button', { name: new RegExp(t.remove) })); await user.click(screen.getByRole('button', { name: t.save })); await screen.findByText(t.saved);
  expect(fixture.draft.lessons).toEqual([]); expect(fixture.draft.draft?.revision).toBe(3);
});
it('blocks actual overlaps while leaving teaching-load differences as warnings', async () => {
  const { user, t } = await open(); await add(user, t); await add(user, t);
  expect(screen.getByText(t.conflictTitle)).toBeInTheDocument(); expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
  expect(screen.getByText(t.COMPLETE)).toBeInTheDocument();
  await user.click(screen.getAllByRole('button', { name: new RegExp(t.remove) })[0]); expect(screen.getByRole('button', { name: t.save })).toBeEnabled();
});
it('keeps local lessons after a stale save, with an explicit discard/reload action and no retry', async () => {
  const { user, t } = await open(); await add(user, t);
  fetcher.mockImplementation(async (path, options) => options?.method === 'PUT' ? Response.json({ error: { code: 'CONFLICT', message: 'Stale', details: { kind: 'STALE_DRAFT' } } }, { status: 409 }) : Response.json({ data: String(path).includes('/draft') ? fixture.draft : fixture.state }));
  await user.click(screen.getByRole('button', { name: t.save })); expect(await screen.findByRole('alert')).toHaveTextContent(t.stale);
  expect(within(screen.getByRole('region', { name: t.grid })).getByText('Math')).toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([, o]) => o?.method === 'PUT')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: t.discard })); await waitFor(() => expect(screen.queryByText(t.unsaved)).not.toBeInTheDocument());
});
it('shows missing configuration, closed context and read errors without unsafe writes', async () => {
  fixture.draft.configuration = null; fixture.draft.effectiveConfiguration = null; fixture.draft.editable = false;
  const { t } = await open(); expect(screen.getByText(t.noConfiguration)).toBeInTheDocument(); expect(screen.getByText(t.readonly)).toBeInTheDocument(); expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
});
