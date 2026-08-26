import type { QueryClient } from '@tanstack/react-query';
import type { EnrollmentListParams, StudentListParams } from './types';

export const studentKeys = {
  all: (schoolId: string) => ['students', schoolId] as const,
  lists: (schoolId: string) => ['students', schoolId, 'list'] as const,
  list: (schoolId: string, params: StudentListParams) => ['students', schoolId, 'list', params] as const,
  detail: (schoolId: string, studentId: string) => ['students', schoolId, 'detail', studentId] as const,
  enrollments: (schoolId: string, studentId: string, params: EnrollmentListParams) => ['students', schoolId, 'enrollments', studentId, params] as const,
  enrollmentPrefix: (schoolId: string, studentId: string) => ['students', schoolId, 'enrollments', studentId] as const,
  current: (schoolId: string, studentId: string, academicYearId: string) => ['students', schoolId, 'current-enrollment', studentId, academicYearId] as const,
  currentPrefix: (schoolId: string, studentId: string) => ['students', schoolId, 'current-enrollment', studentId] as const,
};

export async function invalidateStudent(queryClient: QueryClient, schoolId: string, studentId: string, includeList = false) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: studentKeys.detail(schoolId, studentId) }),
    queryClient.invalidateQueries({ queryKey: studentKeys.enrollmentPrefix(schoolId, studentId) }),
    queryClient.invalidateQueries({ queryKey: studentKeys.currentPrefix(schoolId, studentId) }),
  ];
  if (includeList) tasks.push(queryClient.invalidateQueries({ queryKey: studentKeys.lists(schoolId) }));
  await Promise.all(tasks);
}
