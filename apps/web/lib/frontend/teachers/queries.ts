import type { QueryClient } from '@tanstack/react-query';
import type { AssignmentListParams, TeacherListParams } from './types';

export const teacherKeys = {
  all: (schoolId: string) => ['teachers', schoolId] as const,
  lists: (schoolId: string) => ['teachers', schoolId, 'list'] as const,
  list: (schoolId: string, params: TeacherListParams) => ['teachers', schoolId, 'list', params] as const,
  detail: (schoolId: string, teacherId: string) => ['teachers', schoolId, 'detail', teacherId] as const,
  assignments: (schoolId: string, teacherId: string, params: AssignmentListParams) => ['teachers', schoolId, 'assignments', teacherId, params] as const,
  assignmentPrefix: (schoolId: string, teacherId: string) => ['teachers', schoolId, 'assignments', teacherId] as const,
};

export async function invalidateTeacher(queryClient: QueryClient, schoolId: string, teacherId: string, includeList = false) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: teacherKeys.detail(schoolId, teacherId) }),
    queryClient.invalidateQueries({ queryKey: teacherKeys.assignmentPrefix(schoolId, teacherId) }),
  ];
  if (includeList) tasks.push(queryClient.invalidateQueries({ queryKey: teacherKeys.lists(schoolId) }));
  await Promise.all(tasks);
}
