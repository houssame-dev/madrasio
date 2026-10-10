import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildJourneys } from '@/components/parent/child-journeys';
import { childAttendanceQuery, childHomeworkQuery } from '@/lib/frontend/parent-portal/queries';
import { renderParents, schoolId, student } from '../parents/test-helpers';
const props = { schoolId, studentId: student.id, yearId: 'year-1' };
afterEach(() => vi.restoreAllMocks());
describe('Child read journey states', () => {
  it('requires an explicit eligible Year and does not fetch before navigation', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const user = userEvent.setup();
    renderParents(<ChildJourneys {...props} yearId="" />, 'PARENT');
    await user.click(screen.getByRole('button', { name: 'Homework' }));
    expect(screen.getByText('Select an Academic Year to read Attendance or Homework.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['Attendance', 'Homework'])('renders %s empty and persistent safe error states with retry', async (section) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private provider failure', { status: 500 }));
    const user = userEvent.setup(); renderParents(<ChildJourneys {...props} />, 'PARENT');
    await user.click(screen.getByRole('button', { name: section }));
    expect(await screen.findByText(`${section} unavailable`)).toBeInTheDocument();
    expect(screen.queryByText('private provider failure')).not.toBeInTheDocument();
    fetch.mockResolvedValue(Response.json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(section === 'Attendance' ? 'No attendance records' : 'No homework for this child')).toBeInTheDocument();
  });
  it.each(['Attendance', 'Homework'])('paginates %s in child/Year context and resets after context changes', async (section) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const page = Number(new URL(String(url), 'http://local').searchParams.get('page'));
      return Response.json({ data: [], meta: { page, pageSize: 20, total: 21 } });
    });
    const user = userEvent.setup(); const view = renderParents(<ChildJourneys {...props} />, 'PARENT');
    await user.click(screen.getByRole('button', { name: section }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true));
    view.rerender(<QueryClientProvider client={view.queryClient}><ChildJourneys {...props} yearId="year-2" /></QueryClientProvider>);
    await user.click(screen.getByRole('button', { name: section }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('academicYearId=year-2&page=1'))).toBe(true));
  });
  it('preserves date-only filters and focuses invalid range feedback', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }));
    const user = userEvent.setup(); renderParents(<ChildJourneys {...props} />, 'PARENT');
    await user.click(screen.getByRole('button', { name: 'Attendance' })); await screen.findByText('No attendance records');
    await user.type(screen.getByLabelText('From date'), '2025-10-10'); await user.type(screen.getByLabelText('To date'), '2025-10-09');
    await user.click(screen.getByRole('button', { name: 'Apply dates' }));
    expect(screen.getByLabelText('To date')).toHaveFocus(); expect(fetch).toHaveBeenCalledTimes(1);
    await user.clear(screen.getByLabelText('To date')); await user.type(screen.getByLabelText('To date'), '2025-10-10');
    await user.click(screen.getByRole('button', { name: 'Apply dates' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('dateFrom=2025-10-10&dateTo=2025-10-10'))).toBe(true));
  });
  it('separates caches by School, child, Year, date range and page', () => {
    const base = childAttendanceQuery('s', 'c', 'y', 1).queryKey;
    for (const key of [childAttendanceQuery('s2', 'c', 'y', 1), childAttendanceQuery('s', 'c2', 'y', 1), childAttendanceQuery('s', 'c', 'y2', 1), childAttendanceQuery('s', 'c', 'y', 2), childAttendanceQuery('s', 'c', 'y', 1, '2025-10-10'), childHomeworkQuery('s', 'c', 'y', 1)]) expect(key.queryKey).not.toEqual(base);
  });
});
