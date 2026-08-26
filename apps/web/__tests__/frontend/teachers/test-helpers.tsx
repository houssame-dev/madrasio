import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000101';
export const teacherId = '00000000-0000-4000-8000-000000000102';
export const userId = '00000000-0000-4000-8000-000000000103';
export const yearId = '00000000-0000-4000-8000-000000000104';
export const otherYearId = '00000000-0000-4000-8000-000000000105';
export const classId = '00000000-0000-4000-8000-000000000106';
export const otherClassId = '00000000-0000-4000-8000-000000000107';
export const subjectId = '00000000-0000-4000-8000-000000000108';
export const assignmentId = '00000000-0000-4000-8000-000000000109';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const teacher = { id: teacherId, firstName: 'Leila', lastName: 'Amrani', teacherCode: 'T-01', userId, status: 'ACTIVE' as const, ...timestamps };
export const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'ACTIVE' as const, ...timestamps };
export const klass = { id: classId, academicYearId: yearId, stageId: '00000000-0000-4000-8000-000000000110', levelId: '00000000-0000-4000-8000-000000000111', trackId: null, curriculumVersionId: '00000000-0000-4000-8000-000000000112', name: '1A', status: 'ACTIVE' as const, ...timestamps };
export const subject = { id: subjectId, name: 'Mathematics', code: 'MATH', status: 'ACTIVE' as const, ...timestamps };
export const assignment = { id: assignmentId, teacherId, academicYearId: yearId, classId, subjectId, effectiveFrom: '2026-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };

export function page<T>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) { return { data, meta: { page: pageNumber, pageSize, total } }; }

export function renderTeachers(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}
