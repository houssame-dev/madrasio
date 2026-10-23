import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceHistory } from '@/components/attendance/attendance-history';
import { historyRecord, otherClass, otherYear, page, renderAttendance, sara, schoolId, studentId, year, klass } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Student Attendance history', () => {
  it('uses server Student search, renders historical Class/Year, filters, and backend pagination', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/v1/students?')) return Response.json(page([sara], 1, 20));
      if (url.startsWith(`/api/v1/students/${studentId}/attendance?`)) return Response.json(page([historyRecord], url.includes('page=2') ? 2 : 1, 20, 21));
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAttendance(<AttendanceHistory schoolId={schoolId} years={[year, otherYear]} classes={[klass, otherClass]} />);
    await userEvent.type(await screen.findByLabelText('Search Students by name or code'), 'Sara'); await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=Sara'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Student'), studentId);
    expect(await screen.findByText('Medical')).toBeInTheDocument(); expect(screen.getAllByText('Class B').length).toBeGreaterThan(0); expect(screen.getAllByText('2024/2025').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'EXCUSED');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=EXCUSED'))).toBe(true));
    await userEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1)!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true));
  });

  it('blocks an invalid date range before history fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(page([sara], 1, 20)));
    renderAttendance(<AttendanceHistory schoolId={schoolId} years={[year]} classes={[klass]} />);
    await screen.findByLabelText('Student');
    await userEvent.type(screen.getByLabelText('Date from'), '2025-10-20'); await userEvent.type(screen.getByLabelText('Date to'), '2025-10-10');
    await userEvent.selectOptions(screen.getByLabelText('Student'), studentId);
    expect(await screen.findByRole('alert')).toHaveTextContent('Date from must be on or before date to.');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`students/${studentId}/attendance`))).toBe(false);
  });
});


it('keeps session and legacy history distinguishable and hides stale records for invalid filters', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).startsWith('/api/v1/students?')
    ? Response.json(page([sara], 1, 20))
    : Response.json(page([historyRecord, { ...historyRecord, id: 'session-history', note: 'Lesson note', session: { subjectName: 'Mathematics', start: '08:00', end: '09:00' } }], 1, 20)));
  renderAttendance(<AttendanceHistory schoolId={schoolId} years={[year, otherYear]} classes={[klass, otherClass]} />);
  await screen.findByRole('option', { name: 'Amrani, Sara (S-001)' });
  await userEvent.selectOptions(screen.getByLabelText('Student'), studentId);
  expect(await screen.findByText('Legacy daily history')).toBeInTheDocument();
  expect(screen.getByText('Mathematics')).toBeInTheDocument();
  expect(screen.getByText('08:00–09:00')).toHaveAttribute('dir', 'ltr');
  await userEvent.type(screen.getByLabelText('Date from'), '2025-10-20');
  await userEvent.type(screen.getByLabelText('Date to'), '2025-10-10');
  expect(screen.getByLabelText('Date to')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByText('Medical')).not.toBeInTheDocument();
  expect(screen.queryByText('Lesson note')).not.toBeInTheDocument();
});
