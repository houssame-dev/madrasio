import type { QueryClient } from '@tanstack/react-query';
import type { ParentListParams, RelationshipListParams } from './types';

export const parentKeys = {
  all: (schoolId: string) => ['parents', schoolId] as const,
  lists: (schoolId: string) => ['parents', schoolId, 'list'] as const,
  list: (schoolId: string, params: ParentListParams) => ['parents', schoolId, 'list', params] as const,
  detail: (schoolId: string, parentId: string) => ['parents', schoolId, 'detail', parentId] as const,
  relationships: (schoolId: string, parentId: string, params: RelationshipListParams) => ['parents', schoolId, 'relationships', parentId, params] as const,
  relationshipPrefix: (schoolId: string, parentId: string) => ['parents', schoolId, 'relationships', parentId] as const,
  selfProfiles: (schoolId: string) => ['parents', schoolId, 'self-profiles'] as const,
};
export async function invalidateParent(queryClient: QueryClient, schoolId: string, parentId: string, includeList = false) {
  const tasks = [queryClient.invalidateQueries({ queryKey: parentKeys.detail(schoolId, parentId) }), queryClient.invalidateQueries({ queryKey: parentKeys.relationshipPrefix(schoolId, parentId) }), queryClient.invalidateQueries({ queryKey: parentKeys.selfProfiles(schoolId) })];
  if (includeList) tasks.push(queryClient.invalidateQueries({ queryKey: parentKeys.lists(schoolId) })); await Promise.all(tasks);
}
