import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { PublishedResults } from '@/components/parent/published-results';
import { PublicationHistory } from '@/components/parent/publication-history';
import { childResultsQuery } from '@/lib/frontend/parent-portal/queries';
import { renderParents, schoolId, student } from '../parents/test-helpers';

const props = { schoolId, studentId: student.id, yearId: 'year-1', type: 'SUBJECT' as const, title: 'Subject results' };
const snapshot = { publicationId: 'publication-1', resultType: 'SUBJECT', value: '14.00', publicationVersion: 1, publishedAt: '2026-01-01T12:00:00.000Z', academicYearId: 'year-1', gradingConfigurationVersionId: 'rules-1', state: 'PUBLISHED', displayContext: null };
afterEach(() => vi.restoreAllMocks());

it('reaches all 55 published results with independent page keys and bounded requests', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://local'); const page = Number(url.searchParams.get('page'));
    return Response.json({ data: Array.from({ length: page === 1 ? 50 : 5 }, (_, i) => ({ ...snapshot, publicationId: `publication-${(page - 1) * 50 + i + 1}`, subject: { name: `Subject ${(page - 1) * 50 + i + 1}` }, academicYear: { name: 'Recorded year' }, academicPeriod: { name: 'Recorded term' } })), meta: { page, pageSize: 50, total: 55 } });
  });
  const user = userEvent.setup(); renderParents(<PublishedResults {...props} />, 'PARENT');
  await screen.findByText('Subject 50');
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
  await user.click(screen.getByRole('button', { name: /^Next$/ }));
  await screen.findByText('Subject 55');
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Subject 51')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  expect(screen.getAllByRole('link')[4]).toHaveAttribute('href', `/children/${student.id}/results/publication-55`);
  expect(fetch.mock.calls.every(([url]) => String(url).includes('pageSize=50'))).toBe(true);
  expect(childResultsQuery(schoolId, student.id, 'year-1', 'SUBJECT', 1).queryKey).not.toEqual(childResultsQuery(schoolId, student.id, 'year-1', 'SUBJECT', 2).queryKey);
  await user.click(screen.getByRole('button', { name: /^Previous$/ }));
  await screen.findByText('Subject 1');
});

it('resets result pagination when the owning child/Year component remounts', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const page = Number(new URL(String(input), 'http://local').searchParams.get('page'));
    return Response.json({ data: [], meta: { page, pageSize: 50, total: 55 } });
  });
  const user = userEvent.setup(); const view = renderParents(<PublishedResults key="year-1" {...props} />, 'PARENT');
  await user.click(await screen.findByRole('button', { name: /^Next$/ }));
  await screen.findByText('Page 2 / 2 · 55');
  view.rerender(<QueryClientProvider client={view.queryClient}><PublishedResults key="year-2" {...props} yearId="year-2" /></QueryClientProvider>);
  await screen.findByText('Page 1 / 2 · 55');
  expect(fetch.mock.calls.some(([url]) => String(url).includes('academicYearId=year-2&resultType=SUBJECT&page=1'))).toBe(true);
});

it('does not render cached result rows after a page request loses authorization', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('page=2&')
    ? Response.json({ error: { code: 'NOT_FOUND', message: 'Unavailable' } }, { status: 404 })
    : Response.json({ data: [{ ...snapshot, subject: { name: 'Visible first page' }, academicYear: { name: 'Year' } }], meta: { page: 1, pageSize: 50, total: 55 } }));
  const user = userEvent.setup(); renderParents(<PublishedResults {...props} />, 'PARENT');
  await screen.findByText('Visible first page'); await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Results unavailable');
  expect(screen.queryByText('Visible first page')).not.toBeInTheDocument();
});

it('keeps the exact selected publication visible while paginating immutable history; legacy labels stay absent', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const page = Number(new URL(String(input), 'http://local').searchParams.get('page'));
    return Response.json({ selected: snapshot, data: [{ ...snapshot, publicationId: 'other', publicationVersion: page === 1 ? 21 : 1, state: page === 1 ? 'REVISED' : 'PUBLISHED' }], meta: { page, pageSize: 20, total: 21 } });
  });
  const user = userEvent.setup(); renderParents(<PublicationHistory studentId={student.id} publicationId={snapshot.publicationId} />, 'PARENT');
  const selected = await screen.findByRole('region', { name: 'Selected publication' });
  expect(within(selected).getByText(/Initial publication/)).toBeInTheDocument();
  expect(within(selected).getByText(/Historical display labels were not recorded/)).toBeInTheDocument();
  expect(screen.getByText(/Revised publication/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 / 2 · 21');
  expect(within(screen.getByRole('region', { name: 'Selected publication' })).getByText('Published value: 14.00')).toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('?page=2'))).toBe(true);
});

it('history denial reveals no snapshot or current labels', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'NOT_FOUND', message: 'Unavailable' } }, { status: 404 }));
  renderParents(<PublicationHistory studentId={student.id} publicationId={snapshot.publicationId} />, 'PARENT');
  await screen.findByText('Published result unavailable');
  expect(screen.queryByRole('region', { name: 'Selected publication' })).not.toBeInTheDocument();
});
