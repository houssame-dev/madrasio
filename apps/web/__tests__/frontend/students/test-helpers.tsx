import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000001';
export const studentId = '00000000-0000-4000-8000-000000000002';
export const yearId = '00000000-0000-4000-8000-000000000003';
export const otherYearId = '00000000-0000-4000-8000-000000000004';
export const classId = '00000000-0000-4000-8000-000000000005';
export const otherClassId = '00000000-0000-4000-8000-000000000006';
export const enrollmentId = '00000000-0000-4000-8000-000000000007';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const student = { id: studentId, firstName: 'Amina', lastName: 'Bennani', studentCode: 'S-01', status: 'ACTIVE' as const, ...timestamps };
export const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'ACTIVE' as const, ...timestamps };
export const klass = { id: classId, academicYearId: yearId, stageId: '00000000-0000-4000-8000-000000000008', levelId: '00000000-0000-4000-8000-000000000009', trackId: null, curriculumVersionId: '00000000-0000-4000-8000-000000000010', name: '1A', status: 'ACTIVE' as const, ...timestamps };
export const enrollment = { id: enrollmentId, studentId, academicYearId: yearId, classId, effectiveFrom: '2026-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };

export function page<T>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) { return { data, meta: { page: pageNumber, pageSize, total } }; }

export function renderStudents(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: 'user' }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}
