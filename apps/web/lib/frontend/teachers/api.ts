import { apiRequest } from '@/lib/frontend/api-client';
import type {
  AssignmentListParams, DataResponse, PageResponse, TeacherAssignmentDto,
  TeacherDto, TeacherListParams,
} from './types';

function query(path: `/api/v1/${string}`, params: object = {}): `/api/v1/${string}` {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') values.set(key, String(value));
  }
  const suffix = values.toString();
  return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`;
}

async function data<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> {
  return (await apiRequest<DataResponse<T>>(path, init)).data;
}

const body = (method: 'POST' | 'PATCH', value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

export const teachersApi = {
  list: (params: TeacherListParams) => apiRequest<PageResponse<TeacherDto>>(query('/api/v1/teachers', params)),
  detail: (teacherId: string) => data<TeacherDto>(`/api/v1/teachers/${teacherId}`),
  create: (input: { firstName: string; lastName: string; teacherCode?: string | null; userId?: string | null }) => data<TeacherDto>('/api/v1/teachers', body('POST', input)),
  patch: (teacherId: string, input: Partial<Pick<TeacherDto, 'firstName' | 'lastName' | 'teacherCode' | 'userId' | 'status'>>) => data<TeacherDto>(`/api/v1/teachers/${teacherId}`, body('PATCH', input)),
  assignments: (teacherId: string, params: AssignmentListParams) => apiRequest<PageResponse<TeacherAssignmentDto>>(query(`/api/v1/teachers/${teacherId}/assignments`, params)),
  createAssignment: (teacherId: string, input: { academicYearId: string; classId: string; subjectId: string; effectiveFrom: string }) => data<TeacherAssignmentDto>(`/api/v1/teachers/${teacherId}/assignments`, body('POST', input)),
  endAssignment: (assignmentId: string, input: { effectiveUntil: string }) => data<TeacherAssignmentDto>(`/api/v1/teacher-assignments/${assignmentId}/end`, body('POST', input)),
};

export async function listAllAssignments(teacherId: string, params: Omit<AssignmentListParams, 'page' | 'pageSize'> = {}): Promise<TeacherAssignmentDto[]> {
  const first = await teachersApi.assignments(teacherId, { ...params, page: 1, pageSize: 100 });
  const rows = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) {
    rows.push(...(await teachersApi.assignments(teacherId, { ...params, page, pageSize: 100 })).data);
  }
  return rows;
}
