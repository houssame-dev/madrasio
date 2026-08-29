import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { MockInstance } from 'vitest';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000201';
export const userId = '00000000-0000-4000-8000-000000000202';
export const yearId = '00000000-0000-4000-8000-000000000203';
export const periodId = '00000000-0000-4000-8000-000000000204';
export const classId = '00000000-0000-4000-8000-000000000205';
export const subjectId = '00000000-0000-4000-8000-000000000206';
export const versionId = '00000000-0000-4000-8000-000000000207';
export const gradebookId = '00000000-0000-4000-8000-000000000208';
export const assessmentId = '00000000-0000-4000-8000-000000000209';
export const teacherId = '00000000-0000-4000-8000-000000000217';
export const studentId = '00000000-0000-4000-8000-000000000214';
export const resultId = '00000000-0000-4000-8000-000000000215';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'ACTIVE' as const, ...timestamps };
export const period = { id: periodId, academicYearId: yearId, name: 'Term 1', sequence: 1, startDate: '2026-09-01', endDate: '2026-12-20', status: 'ACTIVE' as const, ...timestamps };
export const klass = { id: classId, academicYearId: yearId, stageId: '00000000-0000-4000-8000-000000000210', levelId: '00000000-0000-4000-8000-000000000211', trackId: null, curriculumVersionId: '00000000-0000-4000-8000-000000000212', name: '1A', status: 'ACTIVE' as const, ...timestamps };
export const subject = { id: subjectId, name: 'Mathematics', code: 'MATH', status: 'ACTIVE' as const, ...timestamps };
export const gradebook = { id: gradebookId, academicYearId: yearId, academicPeriodId: periodId, classId, subjectId, gradingConfigurationVersionId: versionId, name: 'Mathematics Term 1', status: 'DRAFT' as const, ...timestamps };
export const assessment = { id: assessmentId, gradebookId, title: 'Quiz 1', assessmentType: 'QUIZ' as const, maximumScore: '20.00', weight: '1.50', status: 'DRAFT' as const, assessmentDate: '2026-10-10', ...timestamps };
export const configurationVersion = { id: versionId, versionNumber: 2, configuration: { id: '00000000-0000-4000-8000-000000000213', name: 'Standard Grading' } };
export const student = { id: studentId, firstName: 'Sara', lastName: 'Amrani', studentCode: 'S-001', status: 'ACTIVE' as const, ...timestamps };
export const validGrade = { id: '00000000-0000-4000-8000-000000000216', gradebookId, assessmentId, studentId, state: 'VALID' as const, score: '12.25', ...timestamps };
export const matrix = { data: { gradebook: { ...gradebook, status: 'OPEN' as const }, assessments: [{ ...assessment, status: 'PUBLISHED' as const }], students: [{ student, grades: [validGrade] }] }, meta: { page: 1, pageSize: 100, total: 1, assessmentLimit: 100, assessmentTotal: 1 } };
export const subjectResult = { id: resultId, resultType: 'SUBJECT' as const, studentId, academicYearId: yearId, academicPeriodId: periodId, classId, subjectId, gradingConfigurationVersionId: versionId, value: '12.25', status: 'CALCULATED' as const, ...timestamps };
export const teacher = { id: teacherId, firstName: 'Omar', lastName: 'Idrissi', teacherCode: 'T-001', userId, status: 'ACTIVE' as const, ...timestamps };
export const teacherAssignment = { id: '00000000-0000-4000-8000-000000000218', teacherId, academicYearId: yearId, classId, subjectId, effectiveFrom: '2026-09-01', effectiveUntil: null, status: 'ACTIVE' as const, ...timestamps };

export function page<T>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) { return { data, meta: { page: pageNumber, pageSize, total } }; }

export function renderGrades(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}

export function setupGradebookFetch(fetchMock: MockInstance, rows = [gradebook], options: {
  versions?: typeof configurationVersion[];
  discoveryError?: boolean;
  createError?: { featureCode: string; message: string };
  years?: typeof year[];
  classes?: typeof klass[];
  subjects?: typeof subject[];
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/v1/gradebooks?')) return Response.json(page(rows));
    if (url === '/api/v1/gradebooks' && (init as RequestInit | undefined)?.method === 'POST') {
      if (options.createError) return Response.json({ error: { code: 'CONFLICT', ...options.createError } }, { status: 409 });
      return Response.json({ data: gradebook }, { status: 201 });
    }
    if (url === '/api/v1/grading-configuration-versions?page=1&pageSize=100') {
      if (options.discoveryError) return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'unsafe detail' } }, { status: 500 });
      return Response.json(page(options.versions ?? [configurationVersion], 1, 100));
    }
    if (url === `/api/v1/gradebooks/${gradebookId}`) return Response.json({ data: gradebook });
    if (url.startsWith(`/api/v1/gradebooks/${gradebookId}/grades?`)) return Response.json(matrix);
    if (url.startsWith(`/api/v1/gradebooks/${gradebookId}/assessments`)) return Response.json(page([assessment]));
    if (url === '/api/v1/academic-years?page=1&pageSize=100') return Response.json(page(options.years ?? [year], 1, 100));
    if (url === '/api/v1/classes?page=1&pageSize=100') return Response.json(page(options.classes ?? [klass], 1, 100));
    if (url === '/api/v1/subjects?page=1&pageSize=100') return Response.json(page(options.subjects ?? [subject], 1, 100));
    if (url === `/api/v1/academic-years/${yearId}/periods?page=1&pageSize=100`) return Response.json(page([period], 1, 100));
    if (url === '/api/v1/teachers?status=ACTIVE&page=1&pageSize=100') return Response.json(page([teacher], 1, 100));
    if (url === `/api/v1/teachers/${teacherId}/assignments?status=ACTIVE&page=1&pageSize=100`) return Response.json(page([teacherAssignment], 1, 100));
    throw new Error(`Unexpected request: ${url}`);
  });
}
