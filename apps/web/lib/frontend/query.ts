import type { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  me: ['me'] as const,
  school: (schoolId: string) => ['school', schoolId] as const,
  feature: (feature: string, schoolId: string, ...parts: readonly unknown[]) =>
    [feature, schoolId, ...parts] as const,
};

/** School switching is a tenant-boundary event: remove every cached response. */
export function clearCacheForSchoolSwitch(queryClient: QueryClient): void {
  queryClient.clear();
}
