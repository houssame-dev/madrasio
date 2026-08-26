import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherDetailWorkspace } from '@/components/teachers/teacher-detail';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';
import { assignment, klass, page, renderTeachers, subject, teacher, year } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => `/teachers/${teacher.id}`, useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });

function detailFetch(options: { error?: boolean; ended?: boolean } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `/api/v1/teachers/${teacher.id}`) return options.error ? Response.json({ error: { code: 'NOT_FOUND', featureCode: 'TEACHER_NOT_FOUND', message: 'scope detail' } }, { status: 404 }) : Response.json({ data: teacher });
    if (url.includes('/academic-years')) return Response.json(page([year], 1, 100));
    if (url.includes('/classes')) return Response.json(page([klass], 1, 100));
    if (url.includes('/subjects')) return Response.json(page([subject], 1, 100));
    if (url.includes('/assignments')) {
      const rows: TeacherAssignmentDto[] = options.ended ? [{ ...assignment, status: 'ENDED', effectiveUntil: '2026-10-01' }] : [assignment];
      return Response.json(page(rows));
    }
    return Response.json(page([]));
  });
}

describe('Teacher detail and self scope', () => {
  it('renders profile, neutral linked state, and exact Assignment context', async () => {
    detailFetch(); renderTeachers(<TeacherDetailWorkspace teacherId={teacher.id} />);
    expect(await screen.findByRole('heading', { name: 'Leila Amrani' })).toBeInTheDocument(); expect(screen.getByText('Linked to an existing school User')).toBeInTheDocument(); expect(screen.queryByText(teacher.userId)).not.toBeInTheDocument();
    expect(await screen.findByText('Mathematics')).toBeInTheDocument(); expect(screen.getByText('1A')).toBeInTheDocument(); expect(screen.getByText('2026/2027')).toBeInTheDocument();
  });

  it('keeps Teacher self detail and history read-only', async () => {
    const fetchMock = detailFetch({ ended: true }); renderTeachers(<TeacherDetailWorkspace teacherId={teacher.id} />, 'TEACHER');
    expect(await screen.findByText('ENDED')).toBeInTheDocument(); expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Teacher' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Create Assignment' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'End Assignment' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('all-active'))).toBe(false);
  });

  it('maps another or unavailable Teacher to a controlled state', async () => {
    detailFetch({ error: true }); renderTeachers(<TeacherDetailWorkspace teacherId={teacher.id} />, 'TEACHER');
    expect(await screen.findByRole('heading', { name: 'Teacher unavailable' })).toBeInTheDocument(); expect(screen.queryByText(/scope detail/i)).not.toBeInTheDocument();
  });

  it('denies Parent before any detail request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); renderTeachers(<TeacherDetailWorkspace teacherId={teacher.id} />, 'PARENT');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
