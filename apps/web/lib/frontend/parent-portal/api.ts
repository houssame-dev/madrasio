import { apiRequest } from '@/lib/frontend/api-client';

import type { ChildAcademicYear, ChildPlacement, ParentResultPage, ParentResultType } from './types';

function params(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  return query.toString();
}

export const parentChildApi = {
  academicYears: (studentId: string) => apiRequest<{ data: ChildAcademicYear[] }>(`/api/v1/parent/children/${studentId}/academic-years`).then((response) => response.data),
  placement: (studentId: string, academicYearId: string) => apiRequest<{ data: ChildPlacement | null }>(`/api/v1/parent/children/${studentId}/placement?${params({ academicYearId })}`).then((response) => response.data),
  results: (studentId: string, academicYearId: string, resultType: ParentResultType, page = 1, pageSize = 50) => apiRequest<ParentResultPage>(`/api/v1/parent/children/${studentId}/results?${params({ academicYearId, resultType, page, pageSize })}`),
};
