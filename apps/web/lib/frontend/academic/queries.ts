import type { QueryClient } from '@tanstack/react-query';
import type { ListParams } from './types';

export const academicKeys = {
  all: (schoolId: string) => ['academic', schoolId] as const,
  list: (schoolId: string, resource: string, params: ListParams = {}) => ['academic', schoolId, resource, 'list', params] as const,
  periods: (schoolId: string, yearId: string, params: ListParams = {}) => ['academic', schoolId, 'periods', yearId, params] as const,
  versions: (schoolId: string, curriculumId: string, params: ListParams = {}) => ['academic', schoolId, 'versions', curriculumId, params] as const,
  curriculumSubjects: (schoolId: string, versionId: string, params: ListParams = {}) => ['academic', schoolId, 'curriculum-subjects', versionId, params] as const,
  selectors: (schoolId: string, resource: string) => ['academic', schoolId, 'selectors', resource] as const,
};

export function invalidateAcademicList(queryClient: QueryClient, schoolId: string, resource: string) {
  return queryClient.invalidateQueries({ queryKey: ['academic', schoolId, resource] });
}

export function invalidateAcademicPrefix(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.invalidateQueries({ queryKey: key });
}
