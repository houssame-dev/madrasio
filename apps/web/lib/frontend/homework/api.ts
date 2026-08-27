import { apiRequest } from '@/lib/frontend/api-client';
import { listAllAssignments, teachersApi } from '@/lib/frontend/teachers/api';
import type { PageResponse, TeacherAssignmentDto, TeacherDto } from '@/lib/frontend/teachers/types';
import type {
  HomeworkCreateInput, HomeworkDto, HomeworkListParams, HomeworkPatchInput,
  HomeworkRosterResponse, HomeworkSubmissionDto, HomeworkSubmissionListParams, HomeworkTargetDto,
} from './types';

function query(path: `/api/v1/${string}`, params: object = {}): `/api/v1/${string}` {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') values.set(key, String(value));
  const suffix = values.toString();
  return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`;
}

async function data<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> {
  return (await apiRequest<{ data: T }>(path, init)).data;
}

const body = (method: 'POST' | 'PATCH', value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

export const homeworkApi = {
  list: (params: HomeworkListParams) => apiRequest<PageResponse<HomeworkDto>>(query('/api/v1/homeworks', params)),
  create: (input: HomeworkCreateInput) => data<HomeworkDto>('/api/v1/homeworks', body('POST', input)),
  detail: (id: string) => data<HomeworkDto>(`/api/v1/homeworks/${id}`),
  patch: (id: string, input: HomeworkPatchInput) => data<HomeworkDto>(`/api/v1/homeworks/${id}`, body('PATCH', input)),
  targets: (id: string) => data<HomeworkTargetDto[]>(`/api/v1/homeworks/${id}/targets`),
  addTargets: (id: string, classIds: string[]) => data<HomeworkTargetDto[]>(`/api/v1/homeworks/${id}/targets`, body('POST', { classIds })),
  roster: (id: string, page: number) => apiRequest<HomeworkRosterResponse>(query(`/api/v1/homeworks/${id}/students`, { page, pageSize: 50 })),
  submissions: (id: string, params: HomeworkSubmissionListParams) => apiRequest<PageResponse<HomeworkSubmissionDto>>(query(`/api/v1/homeworks/${id}/submissions`, params)),
  createSubmission: (id: string, input: { studentId: string; content: string | null }) => data<HomeworkSubmissionDto>(`/api/v1/homeworks/${id}/submissions`, body('POST', input)),
  submission: (id: string) => data<HomeworkSubmissionDto>(`/api/v1/homework-submissions/${id}`),
  resubmit: (id: string, content: string | null) => data<HomeworkSubmissionDto>(`/api/v1/homework-submissions/${id}`, body('PATCH', { content })),
  review: (id: string, status: 'REVIEWED' | 'RETURNED') => data<HomeworkSubmissionDto>(`/api/v1/homework-submissions/${id}/review`, body('POST', { status })),
};

export async function currentUserHomeworkAssignments(userId: string): Promise<TeacherAssignmentDto[]> {
  const first = await teachersApi.list({ status: 'ACTIVE', page: 1, pageSize: 100 });
  const teachers: TeacherDto[] = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) {
    teachers.push(...(await teachersApi.list({ status: 'ACTIVE', page, pageSize: 100 }) as PageResponse<TeacherDto>).data);
  }
  const owned = teachers.filter((teacher) => teacher.userId === userId);
  return (await Promise.all(owned.map((teacher) => listAllAssignments(teacher.id, { status: 'ACTIVE' })))).flat();
}

