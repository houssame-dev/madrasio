import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyAttendancePanel } from '@/components/attendance/daily-attendance-panel';
import { classId, klass, otherStudentId, renderAttendance, roster, schoolId, studentId, year } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

function setup(options: { error?: boolean; closed?: boolean; total?: number } = {}) {
  const data = { ...roster, data: { ...roster.data, class: options.closed ? { ...klass, status: 'CLOSED' as const } : klass }, meta: { ...roster.meta, total: options.total ?? roster.meta.total } };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith(`/api/v1/classes/${classId}/attendance/2025-10-10?`)) return Response.json(data);
    if (url === `/api/v1/classes/${classId}/attendance/2025-10-10` && (init as RequestInit | undefined)?.method === 'PUT') {
      if (options.error) return Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE', message: 'unsafe' } }, { status: 409 });
      return Response.json({ data: { records: [] } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('authoritative daily Attendance roster', () => {
  it('uses the Class/date roster, renders historical Students without current-enrollment filtering, and preserves null', async () => {
    const fetchMock = setup(); renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={vi.fn()} />);
    expect(await screen.findByText('Sara Amrani')).toBeInTheDocument();
    expect(screen.getAllByText(/Not marked/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('LATE');
    expect(screen.getByLabelText('Attendance note for Omar Bennani')).toHaveValue('Bus delay');
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/classes/${classId}/attendance/2025-10-10?page=1&pageSize=100`, expect.any(Object));
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/v1/students?'))).toBe(false);
  });

  it.each(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const)('submits %s in one atomic bulk request with an exact calendar DATE', async (status) => {
    const fetchMock = setup(); renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={vi.fn()} />);
    await userEvent.selectOptions(await screen.findByLabelText('Attendance status for Sara Amrani'), status);
    await userEvent.type(screen.getByLabelText('Attendance note for Sara Amrani'), 'Plain note');
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    await screen.findByText('Attendance saved atomically.');
    expect(screen.queryByText(/Unsaved Attendance changes/)).not.toBeInTheDocument();
    const writes = fetchMock.mock.calls.filter(([url, init]) => String(url) === `/api/v1/classes/${classId}/attendance/2025-10-10` && (init as RequestInit | undefined)?.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String((writes[0][1] as RequestInit).body))).toEqual({ records: [{ studentId, status, note: 'Plain note' }] });
    expect(fetchMock.mock.calls.some(([url]) => /grades|results|homeworks|notifications|outbox/.test(String(url)))).toBe(false);
  });

  it('marks only unpersisted and still-unedited rows PRESENT without writing before Save', async () => {
    const fetchMock = setup(); renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={vi.fn()} />);
    await screen.findByText('Sara Amrani'); await userEvent.click(screen.getByRole('button', { name: 'Mark unmarked present' }));
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toHaveValue('PRESENT');
    expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('LATE');
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('retains dirty edits and reports one controlled atomic failure', async () => {
    setup({ error: true }); const onDirty = vi.fn(); renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={onDirty} />);
    const status = await screen.findByLabelText('Attendance status for Sara Amrani'); await userEvent.selectOptions(status, 'ABSENT'); await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    expect(await screen.findByText('A selected Student was not enrolled in this Class on the Attendance date.')).toBeInTheDocument();
    expect(status).toHaveValue('ABSENT'); expect(screen.getByText(/Unsaved Attendance changes/)).toBeInTheDocument();
    expect(onDirty).toHaveBeenLastCalledWith(true);
  });

  it('maps a backend Class lifecycle race to controlled correction guidance', async () => {
    const data = roster;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith(`/api/v1/classes/${classId}/attendance/2025-10-10?`)) return Response.json(data);
      if ((init as RequestInit | undefined)?.method === 'PUT') return Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'ATTENDANCE_ENTRY_NOT_ALLOWED', message: 'hidden database detail' } }, { status: 409 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={vi.fn()} />);
    await userEvent.selectOptions(await screen.findByLabelText('Attendance status for Sara Amrani'), 'ABSENT');
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    expect(await screen.findByText('Closed or archived Classes allow corrections to existing Attendance only.')).toBeInTheDocument();
    expect(screen.queryByText('hidden database detail')).not.toBeInTheDocument();
  });

  it('permits existing-row correction but disables creation for null rows in a CLOSED Class', async () => {
    const fetchMock = setup({ closed: true }); renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-10-10" onDirtyChange={vi.fn()} />);
    expect(await screen.findByLabelText('Attendance status for Sara Amrani')).toBeDisabled();
    const existing = screen.getByLabelText('Attendance status for Omar Bennani'); expect(existing).toBeEnabled(); await userEvent.selectOptions(existing, 'PRESENT'); await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(true));
    const write = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse(String((write?.[1] as RequestInit).body)).records[0]).toMatchObject({ studentId: otherStudentId, status: 'PRESENT' });
  });

  it('blocks obvious future and outside-Year dates without fetching', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); const first = renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2099-01-01" onDirtyChange={vi.fn()} />);
    expect(screen.getByText(/Server UTC-day validation remains authoritative/)).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
    first.unmount();
    renderAttendance(<DailyAttendancePanel schoolId={schoolId} academicYear={year} classId={classId} date="2025-08-31" onDirtyChange={vi.fn()} />);
    expect(screen.getByText('The date must fall within the selected Academic Year.')).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
