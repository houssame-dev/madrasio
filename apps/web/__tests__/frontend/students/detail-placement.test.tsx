import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentDetailWorkspace } from '@/components/students/student-detail';
import type { EnrollmentDto } from '@/lib/frontend/students/types';
import { enrollment, klass, page, renderStudents, student, year, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: 'academicYearId=00000000-0000-4000-8000-000000000003', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/students/00000000-0000-4000-8000-000000000002', useRouter: () => ({ replace: navigation.replace }) }));

afterEach(() => { vi.restoreAllMocks(); navigation.search = `academicYearId=${yearId}`; navigation.replace.mockReset(); });

function detailFetch(options: { placement?: EnrollmentDto | null; history?: EnrollmentDto[] } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `/api/v1/students/${student.id}`) return Response.json({ data: student });
    if (url.includes('/academic-years')) return Response.json(page([year], 1, 100));
    if (url.includes('/classes')) return Response.json(page([klass], 1, 100));
    if (url.includes('/enrollments/current')) return Response.json({ data: options.placement === undefined ? enrollment : options.placement });
    if (url.includes('/enrollments')) return Response.json(page(options.history ?? [enrollment]));
    return Response.json({ data: null });
  });
}

describe('Student detail and explicit-Year placement', () => {
  it('requests current placement with the explicit academicYearId and labels only that Year', async () => {
    const fetchMock = detailFetch();
    renderStudents(<StudentDetailWorkspace studentId={student.id} />);
    expect(await screen.findByText('Placement for 2026/2027')).toBeInTheDocument();
    expect(screen.getAllByText('1A').length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === `/api/v1/students/${student.id}/enrollments/current?academicYearId=${yearId}`)).toBe(true);
    expect(screen.queryByText(/Current Class/)).not.toBeInTheDocument();
  });

  it('shows a selected-Year empty placement without reusing stale Class data', async () => {
    detailFetch({ placement: null, history: [] });
    renderStudents(<StudentDetailWorkspace studentId={student.id} />);
    expect(await screen.findByText('No active placement for this Academic Year')).toBeInTheDocument();
    expect(screen.queryByText('Placement for 2026/2027')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Enrollment' })).toBeInTheDocument();
  });

  it('renders ACTIVE and ENDED history, including historical effectiveUntil, and only ACTIVE can end', async () => {
    const ended = { ...enrollment, id: '00000000-0000-4000-8000-000000000011', status: 'ENDED' as const, effectiveUntil: '2026-10-01' };
    detailFetch({ history: [enrollment, ended] });
    renderStudents(<StudentDetailWorkspace studentId={student.id} />);
    expect(await screen.findByText('2026-10-01')).toBeInTheDocument();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    expect(screen.getByText('ENDED')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'End Enrollment' })).toHaveLength(1);
  });

  it('keeps Teacher detail read-only and never requests administrator history', async () => {
    const fetchMock = detailFetch();
    renderStudents(<StudentDetailWorkspace studentId={student.id} />, 'TEACHER');
    expect(await screen.findByText('Placement for 2026/2027')).toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Student' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/enrollments?page='))).toBe(false);
  });

  it('maps backend scope loss to a controlled unavailable state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('/academic-years') ? Response.json(page([year], 1, 100)) : Response.json({ error: { code: 'NOT_FOUND', featureCode: 'STUDENT_NOT_FOUND', message: 'scope detail' } }, { status: 404 }));
    renderStudents(<StudentDetailWorkspace studentId={student.id} />, 'TEACHER');
    expect(await screen.findByRole('heading', { name: 'Student unavailable' })).toBeInTheDocument();
    expect(screen.queryByText(/assignment|scope detail/i)).not.toBeInTheDocument();
  });
});
