import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';
import type { HomeworkRosterSubmissionDto } from '@/lib/frontend/homework/types';

export const schoolId = '00000000-0000-4000-8000-000000000401';
export const userId = '00000000-0000-4000-8000-000000000402';
export const yearId = '00000000-0000-4000-8000-000000000403';
export const periodId = '00000000-0000-4000-8000-000000000404';
export const subjectId = '00000000-0000-4000-8000-000000000405';
export const classAId = '00000000-0000-4000-8000-000000000406';
export const classBId = '00000000-0000-4000-8000-000000000407';
export const teacherId = '00000000-0000-4000-8000-000000000408';
export const homeworkId = '00000000-0000-4000-8000-000000000409';
export const targetId = '00000000-0000-4000-8000-000000000410';
export const studentId = '00000000-0000-4000-8000-000000000411';
export const submissionId = '00000000-0000-4000-8000-000000000412';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const year = { id: yearId, name: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'ACTIVE' as const, ...timestamps };
export const period = { id: periodId, academicYearId: yearId, name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-31', status: 'ACTIVE' as const, ...timestamps };
export const subject = { id: subjectId, name: 'Mathematics', code: 'MATH', status: 'ACTIVE' as const, ...timestamps };
export const classA = { id: classAId, academicYearId: yearId, stageId: crypto.randomUUID(), levelId: crypto.randomUUID(), trackId: null, curriculumVersionId: crypto.randomUUID(), name: 'Class A', status: 'ACTIVE' as const, ...timestamps };
export const classB = { ...classA, id: classBId, name: 'Class B' };
export const teacher = { id: teacherId, firstName: 'Leila', lastName: 'Alaoui', teacherCode: null, userId, status: 'ACTIVE' as const, ...timestamps };
export const assignmentA = { id: crypto.randomUUID(), teacherId, academicYearId: yearId, classId: classAId, subjectId, effectiveFrom: '2025-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };
export const assignmentB = { ...assignmentA, id: crypto.randomUUID(), classId: classBId };
export const homework = { id: homeworkId, teacherId, subjectId, academicYearId: yearId, academicPeriodId: periodId, title: 'Fractions practice', description: 'Complete the exercises.', dueDate: '2025-10-10', status: 'DRAFT' as const, ...timestamps };
export const publishedHomework = { ...homework, status: 'PUBLISHED' as const };
export const target = { id: targetId, homeworkId, targetType: 'CLASS' as const, academicYearId: yearId, classId: classAId, ...timestamps };
export const student = { id: studentId, firstName: 'Sara', lastName: 'Amrani', studentCode: 'S-01', status: 'INACTIVE' as const, ...timestamps };
export const submission = { id: submissionId, homeworkId, studentId, submittedAt: '2025-10-11T09:00:00.000Z', content: 'My answer', status: 'LATE' as const, ...timestamps };
export const rosterSubmission = { id: submission.id, submittedAt: submission.submittedAt, content: submission.content, status: submission.status, updatedAt: submission.updatedAt };
export const roster = (value: HomeworkRosterSubmissionDto | null = null) => ({ data: [{ student, submission: value }], meta: { page: 1, pageSize: 50, total: 1 } });
export const page = <T,>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) => ({ data, meta: { page: pageNumber, pageSize, total } });

export function renderHomework(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}
