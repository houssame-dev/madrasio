import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';
import { assignment, classId, klass, otherClass, otherYear, page, renderAttendance, roster, teacher, teacherId, year, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: `section=daily&academicYearId=00000000-0000-4000-8000-000000000303&classId=00000000-0000-4000-8000-000000000305&date=2025-10-10`, replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/attendance', useRouter: () => ({ replace: navigation.replace }), useSearchParams: () => new URLSearchParams(navigation.search) }));

afterEach(() => { vi.restoreAllMocks(); navigation.replace.mockReset(); navigation.search = `section=daily&academicYearId=${yearId}&classId=${classId}&date=2025-10-10`; });

function setup() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/academic-years?page=1&pageSize=100') return Response.json(page([year, otherYear], 1, 100));
    if (url === '/api/v1/classes?page=1&pageSize=100') return Response.json(page([klass, otherClass], 1, 100));
    if (url.startsWith(`/api/v1/classes/${classId}/attendance/2025-10-10?`)) return Response.json(roster);
    if (url === '/api/v1/teachers?status=ACTIVE&page=1&pageSize=100') return Response.json(page([teacher], 1, 100));
    if (url === `/api/v1/teachers/${teacherId}/assignments?status=ACTIVE&page=1&pageSize=100`) return Response.json(page([assignment], 1, 100));
    if (url.startsWith('/api/v1/attendance/sessions?')) return Response.json({ data: { date: '2025-10-10', sessions: [] } });
    if (url.startsWith('/api/v1/students?')) return Response.json(page([], 1, 20));
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Attendance workspace access and exact context', () => {
  it('defaults to the School calendar day rather than the browser day', async () => {
    setup();
    navigation.search = `section=daily&academicYearId=${yearId}&classId=${classId}`;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-10-11T00:30:00Z'));
    try {
      renderAttendance(<AttendanceWorkspace />, 'SCHOOL_ADMIN', 'America/New_York');
      expect(await screen.findByText('Sara Amrani')).toBeInTheDocument();
      expect(screen.getByLabelText('Attendance date')).toHaveValue('2025-10-10');
    } finally { vi.useRealTimers(); }
  });
  it('allows SchoolAdmin read-only browsing and keeps Year-driven Class options exact', async () => {
    setup(); renderAttendance(<AttendanceWorkspace />);
    expect(await screen.findByText('Sara Amrani')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Class A/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Class B/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Academic Year'), otherYear.id);
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining(`academicYearId=${otherYear.id}`), { scroll: false });
    expect(navigation.replace.mock.calls.at(-1)?.[0]).not.toContain('classId=');
  });

  it('replaces arbitrary Teacher Class recording with authorized session selection', async () => {
    setup(); renderAttendance(<AttendanceWorkspace />, 'TEACHER');
    expect(await screen.findByText('No authorized published sessions for this date.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Class')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Legacy daily history' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Attendance' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Student history' }));
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('section=history'), { scroll: false });
  });
  it('renders Teacher history through the server-scoped workflow', async () => {
    navigation.search = 'section=history'; setup(); renderAttendance(<AttendanceWorkspace />, 'TEACHER');
    expect(await screen.findByRole('heading', { name: 'Student history' })).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).startsWith('/api/v1/students?'))).toBe(true));
  });

  it('denies Parent before any raw Attendance or discovery request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); renderAttendance(<AttendanceWorkspace />, 'PARENT');
    expect(screen.getByText('Access unavailable')).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });

});
