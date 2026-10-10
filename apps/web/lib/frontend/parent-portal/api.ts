import { apiRequest } from '@/lib/frontend/api-client';

import type { ChildAcademicYear, ChildPlacement, ParentResultPage, ParentResultType } from './types';

export interface ChildAttendanceRow { id: string; date: string; status: string; className: string }
export interface ChildHomeworkRow { id: string; title: string; description: string | null; dueDate: string; status: string; subjectName: string; periodName: string }
export interface ChildReadPage<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }

function params(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  return query.toString();
}

export const parentChildApi = {
  attendance: (studentId: string, academicYearId: string, page: number, dateFrom?: string, dateTo?: string) => apiRequest<ChildReadPage<ChildAttendanceRow>>(`/api/v1/parent/children/${studentId}/attendance?${params({ academicYearId, page, pageSize: 20, dateFrom, dateTo })}`),
  homework: (studentId: string, academicYearId: string, page: number) => apiRequest<ChildReadPage<ChildHomeworkRow>>(`/api/v1/parent/children/${studentId}/homeworks?${params({ academicYearId, page, pageSize: 20 })}`),
  academicYears: (studentId: string) => apiRequest<{ data: ChildAcademicYear[] }>(`/api/v1/parent/children/${studentId}/academic-years`).then((response) => response.data),
  placement: (studentId: string, academicYearId: string) => apiRequest<{ data: ChildPlacement | null }>(`/api/v1/parent/children/${studentId}/placement?${params({ academicYearId })}`).then((response) => response.data),
  results: (studentId: string, academicYearId: string, resultType: ParentResultType, page = 1, pageSize = 50) => apiRequest<ParentResultPage>(`/api/v1/parent/children/${studentId}/results?${params({ academicYearId, resultType, page, pageSize })}`),
};
