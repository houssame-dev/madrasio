import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getCatalog } from '@/i18n/catalogs';
import { GlobalSearch } from '@/components/app/global-search';
import type { MeResponseDto } from '@/lib/api/me';
import type { SearchResponse } from '@/lib/modules/search/contracts';
const mocks = vi.hoisted(() => ({ push: vi.fn(), api: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/dashboard' }));
vi.mock('@/lib/frontend/api-client', () => ({ apiRequest: mocks.api }));
const context: MeResponseDto = { user: { id: 'local-user' }, currentSchool: { id: 'school-a', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [] };
const value = (name = 'Amine Local'): SearchResponse => ({ scope: { userId: 'local-user', schoolId: 'school-a', role: 'SCHOOL_ADMIN' }, data: [{ id: 'student-a', category: 'students', name, detail: 'S-42', href: '/students/student-a' }] });
function tree(c = context, locale: 'en' | 'fr' | 'ar' = 'en') { return <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><GlobalSearch key={`${c.user.id}:${c.currentSchool!.id}:${c.currentSchool!.role}`} context={c} /></NextIntlClientProvider>; }
async function open() { fireEvent.click(screen.getByRole('button', { name: getCatalog('en').globalSearch.open })); return screen.findByRole('combobox'); }
beforeEach(() => { mocks.api.mockReset().mockResolvedValue(value()); mocks.push.mockReset(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
it('opens by shortcut, focuses the input, uses authorized quick pages and returns focus on Escape', async () => {
  render(tree()); const trigger = screen.getByRole('button', { name: 'Search Madrasio' }); trigger.focus();
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); const input = await screen.findByRole('combobox');
  await waitFor(() => expect(input).toHaveFocus()); expect(screen.getAllByRole('option')).toHaveLength(13);
  expect(mocks.api).not.toHaveBeenCalled(); fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); await waitFor(() => expect(trigger).toHaveFocus());
});
it('does not steal shortcuts from another editor', () => {
  render(<><input aria-label="Other editor" />{tree()}</>); const editor = screen.getByLabelText('Other editor'); editor.focus();
  fireEvent.keyDown(editor, { key: 'k', ctrlKey: true }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('debounces record search, filters categories and navigates through Arrow/Enter to the exact result', async () => {
  render(tree()); const input = await open();
  fireEvent.change(input, { target: { value: 'A' } }); fireEvent.change(input, { target: { value: 'Am' } }); fireEvent.change(input, { target: { value: 'Amine' } });
  await screen.findByRole('option', { name: /Amine Local/ }); expect(mocks.api).toHaveBeenCalledTimes(1);
  expect(mocks.api.mock.calls[0][0]).toContain('q=Amine');
  fireEvent.click(within(screen.getByRole('group', { name: 'Search categories' })).getByRole('button', { name: 'Students' }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2)); expect(mocks.api.mock.calls[1][0]).toContain('category=students');
  await screen.findByRole('option', { name: /Amine Local/ }); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(mocks.push).toHaveBeenCalledWith('/students/student-a');
});
it('ignores stale responses even if the transport does not honor cancellation, and aborts on close', async () => {
  const resolve: ((v: SearchResponse) => void)[] = [];
  mocks.api.mockImplementation(() => new Promise<SearchResponse>(done => resolve.push(done)));
  render(tree()); const input = await open(); fireEvent.change(input, { target: { value: 'First' } }); await waitFor(() => expect(resolve).toHaveLength(1));
  fireEvent.change(input, { target: { value: 'Second' } }); await waitFor(() => expect(resolve).toHaveLength(2));
  await act(async () => { resolve[1](value('Second')); }); await screen.findByRole('option', { name: /Second/ });
  await act(async () => { resolve[0](value('First')); }); expect(screen.queryByRole('option', { name: /First/ })).not.toBeInTheDocument();
  expect(mocks.api.mock.calls[0][1].signal.aborted).toBe(true);
  fireEvent.keyDown(input, { key: 'Escape' }); await waitFor(() => expect(mocks.api.mock.calls[1][1].signal.aborted).toBe(true));
});
it('clears state on scope transition and refuses response scope drift', async () => {
  const view = render(tree()); const input = await open(); fireEvent.change(input, { target: { value: 'Amine' } }); await screen.findByRole('option', { name: /Amine Local/ });
  view.rerender(tree({ ...context, currentSchool: { ...context.currentSchool!, id: 'school-b', role: 'PARENT' } }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const second = await open(); fireEvent.change(second, { target: { value: 'Amine' } });
  await screen.findByRole('alert'); expect(screen.queryByRole('option', { name: /Amine Local/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Students' })).not.toBeInTheDocument();
});
it('supports a safe retry and clears query/results on closing and reopening', async () => {
  mocks.api.mockRejectedValueOnce(new Error('unsafe transport detail')).mockResolvedValue(value());
  render(tree()); const input = await open(); fireEvent.change(input, { target: { value: 'Amine' } });
  await screen.findByRole('alert'); expect(screen.queryByText('unsafe transport detail')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry search' })); await screen.findByRole('option', { name: /Amine Local/ });
  fireEvent.keyDown(input, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const next = await open(); expect(next).toHaveValue(''); expect(screen.queryByRole('option', { name: /Amine Local/ })).not.toBeInTheDocument();
});
it.each(['en', 'fr', 'ar'] as const)('localizes %s controls and keeps Parent quick destinations/read scope', async locale => {
  const c = { ...context, currentSchool: { ...context.currentSchool!, role: 'PARENT' as const } }, copy = getCatalog(locale).globalSearch;
  render(tree(c, locale)); fireEvent.click(screen.getByRole('button', { name: copy.open }));
  const dialog = await screen.findByRole('dialog'); expect(dialog).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(screen.getAllByRole('option')).toHaveLength(5);
  const filters = screen.getByRole('group', { name: copy.filters }); expect(within(filters).getAllByRole('button')).toHaveLength(3);
  fireEvent.click(screen.getAllByRole('option')[2]); expect(mocks.push).toHaveBeenCalledWith('/children');
});
