import type { QueryClient } from '@tanstack/react-query';
import type { AssessmentListParams, GradebookListParams, ResultListParams, ResultType } from './types';

export const gradeKeys = {
  all: (schoolId: string) => ['grades', schoolId] as const,
  gradebooks: (schoolId: string) => ['grades', schoolId, 'gradebooks'] as const,
  configurationVersions: (schoolId: string) => ['grades', schoolId, 'configuration-versions'] as const,
  teacherScope: (schoolId: string, userId: string) => ['grades', schoolId, 'teacher-scope', userId] as const,
  gradebookList: (schoolId: string, params: GradebookListParams) => ['grades', schoolId, 'gradebooks', 'list', params] as const,
  gradebookDetail: (schoolId: string, gradebookId: string) => ['grades', schoolId, 'gradebooks', 'detail', gradebookId] as const,
  assessments: (schoolId: string, gradebookId: string) => ['grades', schoolId, 'gradebooks', gradebookId, 'assessments'] as const,
  assessmentList: (schoolId: string, gradebookId: string, params: AssessmentListParams) => ['grades', schoolId, 'gradebooks', gradebookId, 'assessments', params] as const,
  gradeMatrix: (schoolId: string, gradebookId: string, page: number, pageSize: number) => ['grades', schoolId, 'gradebooks', gradebookId, 'matrix', { page, pageSize }] as const,
  gradeMatrices: (schoolId: string, gradebookId: string) => ['grades', schoolId, 'gradebooks', gradebookId, 'matrix'] as const,
  results: (schoolId: string) => ['grades', schoolId, 'results'] as const,
  resultType: (schoolId: string, resultType: ResultType) => ['grades', schoolId, 'results', resultType] as const,
  resultList: (schoolId: string, resultType: ResultType, params: ResultListParams) => ['grades', schoolId, 'results', resultType, 'list', params] as const,
  resultDetail: (schoolId: string, resultType: ResultType, resultId: string) => ['grades', schoolId, 'results', resultType, 'detail', resultId] as const,
};

export async function invalidateAfterGradeSave(queryClient: QueryClient, schoolId: string, gradebookId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: gradeKeys.gradeMatrices(schoolId, gradebookId) }),
    queryClient.invalidateQueries({ queryKey: gradeKeys.results(schoolId) }),
  ]);
}

export async function invalidateResult(queryClient: QueryClient, schoolId: string, resultType: ResultType, resultId?: string) {
  const tasks = [queryClient.invalidateQueries({ queryKey: gradeKeys.resultType(schoolId, resultType) })];
  if (resultId) tasks.push(queryClient.invalidateQueries({ queryKey: gradeKeys.resultDetail(schoolId, resultType, resultId) }));
  await Promise.all(tasks);
}

export async function invalidateGradebook(queryClient: QueryClient, schoolId: string, gradebookId: string, includeLists = false) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: gradeKeys.gradebookDetail(schoolId, gradebookId) }),
    queryClient.invalidateQueries({ queryKey: gradeKeys.assessments(schoolId, gradebookId) }),
  ];
  if (includeLists) tasks.push(queryClient.invalidateQueries({ queryKey: gradeKeys.gradebooks(schoolId) }));
  await Promise.all(tasks);
}
