import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000301';
export const userId = '00000000-0000-4000-8000-000000000302';
export const yearId = '00000000-0000-4000-8000-000000000303';
export const otherYearId = '00000000-0000-4000-8000-000000000304';
export const classId = '00000000-0000-4000-8000-000000000305';
export const otherClassId = '00000000-0000-4000-8000-000000000306';
export const studentId = '00000000-0000-4000-8000-000000000307';
export const otherStudentId = '00000000-0000-4000-8000-000000000308';
export const teacherId = '00000000-0000-4000-8000-000000000309';
export const assignmentId = '00000000-0000-4000-8000-000000000310';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const year = { id: yearId, name: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'ACTIVE' as const, ...timestamps };
export const otherYear = { ...year, id: otherYearId, name: '2024/2025', startDate: '2024-09-01', endDate: '2025-06-30', status: 'CLOSED' as const };
export const klass = { id: classId, academicYearId: yearId, stageId: crypto.randomUUID(), levelId: crypto.randomUUID(), trackId: null, curriculumVersionId: crypto.randomUUID(), name: 'Class A', status: 'ACTIVE' as const, ...timestamps };
export const otherClass = { ...klass, id: otherClassId, academicYearId: otherYearId, name: 'Class B', status: 'CLOSED' as const };
export const sara = { id: studentId, firstName: 'Sara', lastName: 'Amrani', studentCode: 'S-001', status: 'INACTIVE' as const, ...timestamps };
export const omar = { id: otherStudentId, firstName: 'Omar', lastName: 'Bennani', studentCode: null, status: 'ACTIVE' as const, ...timestamps };
export const attendance = { id: crypto.randomUUID(), status: 'LATE' as const, note: 'Bus delay', ...timestamps };
export const roster = { data: { class: klass, attendanceDate: '2025-10-10', students: [{ student: sara, attendance: null }, { student: omar, attendance }] }, meta: { page: 1, pageSize: 100, total: 2 } };
export const teacher = { id: teacherId, firstName: 'Leila', lastName: 'Alaoui', teacherCode: null, userId, status: 'ACTIVE' as const, ...timestamps };
export const assignment = { id: assignmentId, teacherId, academicYearId: yearId, classId, subjectId: crypto.randomUUID(), effectiveFrom: '2025-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };
export const historyRecord = { id: crypto.randomUUID(), studentId, academicYearId: otherYearId, classId: otherClassId, attendanceDate: '2025-01-10', status: 'EXCUSED' as const, note: 'Medical', ...timestamps };

export function page<T>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) { return { data, meta: { page: pageNumber, pageSize, total } }; }

export function renderAttendance(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}

