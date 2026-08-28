import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';

export const schoolId = '00000000-0000-4000-8000-000000000801';
export const otherSchoolId = '00000000-0000-4000-8000-000000000802';
export const userId = '00000000-0000-4000-8000-000000000803';
export const teacherId = '00000000-0000-4000-8000-000000000804';
export const yearId = '00000000-0000-4000-8000-000000000805';
export const classId = '00000000-0000-4000-8000-000000000806';
export const subjectId = '00000000-0000-4000-8000-000000000807';
export const secondSubjectId = '00000000-0000-4000-8000-000000000808';
export const timestamps = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
export const teacher = { id: teacherId, firstName: 'Leila', lastName: 'Amrani', teacherCode: 'T-01', userId, status: 'ACTIVE' as const, ...timestamps };
export const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'ACTIVE' as const, ...timestamps };
export const klass = { id: classId, academicYearId: yearId, stageId: crypto.randomUUID(), levelId: crypto.randomUUID(), trackId: null, curriculumVersionId: crypto.randomUUID(), name: '1A', status: 'ACTIVE' as const, ...timestamps };
export const subject = { id: subjectId, name: 'Mathematics', code: 'MATH', status: 'ACTIVE' as const, ...timestamps };
export const secondSubject = { id: secondSubjectId, name: 'Physics', code: 'PHY', status: 'ACTIVE' as const, ...timestamps };
export const assignment = { id: crypto.randomUUID(), teacherId, academicYearId: yearId, classId, subjectId, effectiveFrom: '2026-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };
export const secondAssignment = { ...assignment, id: crypto.randomUUID(), subjectId: secondSubjectId };
export const endedAssignment = { ...assignment, id: crypto.randomUUID(), subjectId: secondSubjectId, status: 'ENDED' as const, effectiveUntil: '2026-10-01' };
export function page<T>(data: T[], pageNumber = 1, pageSize = 100, total = data.length) { return { data, meta: { page: pageNumber, pageSize, total } }; }

export function renderDashboard(ui: ReactElement, role: Role = 'TEACHER'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}

export function successfulDashboardFetch(assignments: TeacherAssignmentDto[] = [assignment], unread = 3) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/v1/teachers?')) return Response.json(page([teacher]));
    if (url.includes(`/api/v1/teachers/${teacherId}/assignments`)) return Response.json(page(assignments));
    if (url.startsWith('/api/v1/academic-years?')) return Response.json(page([year]));
    if (url.startsWith('/api/v1/classes?')) return Response.json(page([klass]));
    if (url.startsWith('/api/v1/subjects?')) return Response.json(page([subject, secondSubject]));
    if (url === '/api/v1/notifications/unread-count') return Response.json({ data: { count: unread } });
    throw new Error(`Unexpected request: ${url}`);
  });
}
