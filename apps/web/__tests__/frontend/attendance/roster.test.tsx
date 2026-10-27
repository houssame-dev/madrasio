import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionAttendancePanel } from '@/components/attendance/session-attendance-panel';
import { DailyAttendancePanel } from '@/components/attendance/daily-attendance-panel';
import { classId, schoolId, yearId, year, roster, renderAttendance, studentId, assignment } from './test-helpers';
import { getCatalog } from '@/i18n/catalogs';
const session = { publicationId: '00000000-0000-4000-8000-000000000321', lessonKey: '00000000-0000-4000-8000-000000000322', date: '2025-10-10', classId, academicYearId: yearId, className: 'Class A', subjectId: assignment.subjectId, subjectName: 'Mathematics', teacherId: assignment.teacherId, teacherAssignmentId: assignment.id, teacherName: 'Teacher', weekday: 5, start: '08:00', end: '09:00', roomId: null, roomName: null, writable: true };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-10-10T12:00:00Z')); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function setup(writable = true, empty = false, error = false) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/v1/attendance/sessions?')) return Response.json({ data: { date: session.date, sessions: empty ? [] : [{ ...session, writable }] } });
    if (url.startsWith('/api/v1/attendance/session?')) {
      if (init?.method === 'PUT') return error ? Response.json({ error: { code: 'CONFLICT', message: 'Reload before saving.' } }, { status: 409 }) : Response.json({ data: { records: [] } });
      return Response.json({ ...roster, data: { ...roster.data, session: { ...session, writable } } });
    }
    if (url.startsWith('/api/v1/classes/')) return Response.json(roster);
    throw Error('Unexpected attendance request');
  });
}
async function open(_locale: 'en' | 'fr' | 'ar' = 'en') {
  await userEvent.click(await screen.findByRole('button', { name: /Mathematics.*Class A.*08:00/ }));
  await screen.findByText('Sara Amrani');
}
describe('Teacher session roster and Admin read-only access', () => {
  it('refreshes server availability once at the School lesson start and retains subsequent unsaved edits', async () => {
    // 08:00 in New York is 12:00 UTC on this date, independent of the browser timezone.
    vi.setSystemTime(new Date('2025-10-10T11:59:00Z'));
    const timer = vi.spyOn(window, 'setTimeout');
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const writable = Date.now() >= Date.parse('2025-10-10T12:00:00Z');
      if (String(input).startsWith('/api/v1/attendance/sessions?')) return Response.json({ data: { date: session.date, sessions: [{ ...session, writable }] } });
      return Response.json({ ...roster, data: { ...roster.data, session: { ...session, writable } } });
    });
    const { queryClient } = renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="America/New_York" onDirtyChange={vi.fn()} />, 'TEACHER', 'America/New_York');
    await screen.findByText('Not started');
    await open();
    expect(screen.queryByLabelText('Attendance status for Sara Amrani')).not.toBeInTheDocument();
    const scheduled = timer.mock.calls.find(([, delay]) => delay === 60_000);
    expect(scheduled).toBeDefined();
    const [handler, , ...args] = scheduled!;
    if (typeof handler !== 'function') throw new Error('Expected the lesson-start callback');
    await act(async () => { vi.setSystemTime(new Date('2025-10-10T12:00:00Z')); handler(...args); });
    await screen.findByLabelText('Attendance status for Sara Amrani');
    expect(fetch.mock.calls.filter(([input]) => String(input).startsWith('/api/v1/attendance/sessions?'))).toHaveLength(2);
    expect(fetch.mock.calls.filter(([input]) => String(input).startsWith('/api/v1/attendance/session?'))).toHaveLength(2);
    expect(timer.mock.calls.filter(([, delay]) => delay === 60_000)).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'LATE');
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['attendance', schoolId] }); });
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toHaveValue('LATE');
    expect(screen.getByText(/Unsaved Attendance changes/)).toBeInTheDocument();
  });
  it.each(['en', 'fr', 'ar'] as const)('records an actual selected session with accessible %s controls', async locale => {
    const fetch = setup(); const t = getCatalog(locale).attendance;
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER', 'UTC', locale); await open(locale);
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'ABSENT');
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    await screen.findByText(t.saved);
    const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT'); expect(writes).toHaveLength(1);
    expect(String(writes[0][0])).toContain(`publicationId=${session.publicationId}`); expect(String(writes[0][0])).toContain(`lessonKey=${session.lessonKey}`);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ records: [{ studentId, status: 'ABSENT', note: null, expectedVersion: null }] });
    expect(screen.getByText('08:00–09:00')).toHaveAttribute('dir', 'ltr');
  });
  it('renders Admin session and legacy records with no recording, bulk or save controls', async () => {
    const fetch = setup(false); renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />); await open();
    expect(screen.queryByRole('button', { name: 'Save Attendance' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Mark unmarked present' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Attendance status for Sara Amrani')).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  it('never makes a legacy daily roster editable even for a Teacher', async () => {
    setup(); renderAttendance(<DailyAttendancePanel schoolId={schoolId} timezone="UTC" academicYear={year} classId={classId} date={session.date} onDirtyChange={vi.fn()} />, 'TEACHER');
    await screen.findByText('Sara Amrani'); expect(screen.queryByRole('button', { name: 'Save Attendance' })).not.toBeInTheDocument();
  });
  it('retains unsaved changes after failed save and guards date changes', async () => {
    setup(true, false, true); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'LATE');
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' })); await screen.findByText('Attendance changed. Reload the session before saving again.');
    fireEvent.change(screen.getByLabelText('Attendance date'), { target: { value: '2025-10-09' } }); expect(confirm).toHaveBeenCalled(); expect(screen.getByLabelText('Attendance date')).toHaveValue(session.date);
    await waitFor(() => expect(screen.getByText(/Unsaved Attendance changes/)).toBeInTheDocument());
    const link = document.createElement('a'); link.href = '/dashboard'; document.body.append(link);
    try { expect(fireEvent.click(link)).toBe(false); expect(confirm).toHaveBeenCalledWith('Discard unsaved Attendance changes?'); } finally { link.remove(); }
  });
  it('shows an explicit empty state for missing published sessions', async () => {
    setup(true, true); renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER');
    expect(await screen.findByText('No authorized published sessions for this date.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Attendance' })).not.toBeInTheDocument();
  });
});


describe('Attendance recording feedback and safe bulk actions', () => {
  it('marks only pristine unmarked records and sends no saved or drafted rows to the batch', async () => {
    const fetch = setup();
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.click(screen.getByRole('button', { name: 'Mark unmarked present' }));
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toHaveValue('PRESENT');
    expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('LATE');
    expect(screen.getByLabelText('Attendance note for Omar Bennani')).toHaveValue('Bus delay');
    expect(screen.getAllByText('Changed')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    await screen.findByText('Attendance saved atomically.');
    const write = fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({ records: [{ studentId, status: 'PRESENT', note: null, expectedVersion: null }] });
  });
  it('never overwrites an existing draft status or note during bulk marking', async () => {
    setup(); renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'EXCUSED');
    await userEvent.type(screen.getByLabelText('Attendance note for Sara Amrani'), 'Approved absence');
    await userEvent.click(screen.getByRole('button', { name: 'Mark unmarked present' }));
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toHaveValue('EXCUSED');
    expect(screen.getByLabelText('Attendance note for Sara Amrani')).toHaveValue('Approved absence');
    expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('LATE');
  });
  it('exposes saving feedback and locks the submitted controls until the request settles', async () => {
    const fetch = setup(); const original = fetch.getMockImplementation()!;
    let release: () => void = () => { throw new Error('Save has not started'); };
    const pending = new Promise<void>(resolve => { release = resolve; });
    fetch.mockImplementation(async (input, init) => { if (init?.method === 'PUT') await pending; return original(input, init); });
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'PRESENT');
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    expect(await screen.findByRole('button', { name: 'Saving attendance…' })).toBeDisabled();
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toBeDisabled();
    expect(screen.getByLabelText('Attendance note for Sara Amrani')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark unmarked present' })).toBeDisabled();
    await act(async () => release()); await screen.findByText('Attendance saved atomically.');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });
  it('keeps correction values and the expected version after a conflict without automatically retrying', async () => {
    const fetch = setup(true, false, true);
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Omar Bennani'), 'EXCUSED');
    await userEvent.clear(screen.getByLabelText('Attendance note for Omar Bennani'));
    await userEvent.type(screen.getByLabelText('Attendance note for Omar Bennani'), 'Correction reason');
    await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
    await screen.findByText('Your edits are still here. They have not been saved.');
    expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('EXCUSED');
    expect(screen.getByLabelText('Attendance note for Omar Bennani')).toHaveValue('Correction reason');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    expect(screen.getByText(/Unsaved Attendance changes: 1/)).toBeInTheDocument();
  });
  it('protects dirty roster pagination and keeps the current status selection', async () => {
    const fetch = setup(); const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input).startsWith('/api/v1/attendance/session?') && !init?.method) return Response.json({ ...await response.json(), meta: { page: 1, pageSize: 100, total: 101 } });
      return response;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
    await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'ABSENT');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved Attendance changes?');
    expect(screen.getByLabelText('Attendance status for Sara Amrani')).toHaveValue('ABSENT');
    expect(fetch.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(false);
  });
});


it('retains invalid note edits and reports validation without sending a write', async () => {
  const fetch = setup();
  renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER'); await open();
  await userEvent.selectOptions(screen.getByLabelText('Attendance status for Sara Amrani'), 'PRESENT');
  // Exercise the submit boundary even if a browser/assistive input bypasses maxLength.
  fireEvent.change(screen.getByLabelText('Attendance note for Sara Amrani'), { target: { value: 'x'.repeat(1001) } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Note must contain at most 1,000 characters.');
  expect(screen.getByLabelText('Attendance note for Sara Amrani')).toHaveValue('x'.repeat(1001));
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});
it('requires explicit discard before reviewing latest records after a stale correction', async () => {
  const fetch = setup(true, false, true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={vi.fn()} />, 'TEACHER');
  await open();
  await userEvent.selectOptions(screen.getByLabelText('Attendance status for Omar Bennani'), 'EXCUSED');
  await userEvent.click(screen.getByRole('button', { name: 'Save Attendance' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Review latest records' }));
  expect(confirm).toHaveBeenCalledWith('Discard unsaved Attendance changes?');
  expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('EXCUSED');
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Review latest records' }));
  await waitFor(() => expect(screen.getByLabelText('Attendance status for Omar Bennani')).toHaveValue('LATE'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
});
