import type { QueryClient } from '@tanstack/react-query';
import type { AssessmentListParams, GradebookListParams } from './types';

export const gradeKeys = {
  all: (schoolId: string) => ['grades', schoolId] as const,
  gradebooks: (schoolId: string) => ['grades', schoolId, 'gradebooks'] as const,
  configurationVersions: (schoolId: string) => ['grades', schoolId, 'configuration-versions'] as const,
  gradebookList: (schoolId: string, params: GradebookListParams) => ['grades', schoolId, 'gradebooks', 'list', params] as const,
  gradebookDetail: (schoolId: string, gradebookId: string) => ['grades', schoolId, 'gradebooks', 'detail', gradebookId] as const,
  assessments: (schoolId: string, gradebookId: string) => ['grades', schoolId, 'gradebooks', gradebookId, 'assessments'] as const,
  assessmentList: (schoolId: string, gradebookId: string, params: AssessmentListParams) => ['grades', schoolId, 'gradebooks', gradebookId, 'assessments', params] as const,
};

export async function invalidateGradebook(queryClient: QueryClient, schoolId: string, gradebookId: string, includeLists = false) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: gradeKeys.gradebookDetail(schoolId, gradebookId) }),
    queryClient.invalidateQueries({ queryKey: gradeKeys.assessments(schoolId, gradebookId) }),
  ];
  if (includeLists) tasks.push(queryClient.invalidateQueries({ queryKey: gradeKeys.gradebooks(schoolId) }));
  await Promise.all(tasks);
}
