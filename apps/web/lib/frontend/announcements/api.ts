import { apiRequest } from '@/lib/frontend/api-client';
import { listAllAssignments, teachersApi } from '@/lib/frontend/teachers/api';
import type { TeacherAssignmentDto, TeacherDto } from '@/lib/frontend/teachers/types';
import type { AnnouncementDetailDto, AnnouncementDto, AnnouncementListParams, AnnouncementPage, AnnouncementPublicationPage, AnnouncementPublishDto, AnnouncementTargetDto, AnnouncementTargetInput, AnnouncementVersionDto, AnnouncementVersionPage } from './types';

function query(path: `/api/v1/${string}`, params: object = {}): `/api/v1/${string}` {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') values.set(key, String(value));
  const suffix = values.toString(); return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`;
}
async function data<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> { return (await apiRequest<{ data: T }>(path, init)).data; }
const write = (method: 'POST' | 'PATCH', value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

export const announcementsApi = {
  list: (params: AnnouncementListParams) => apiRequest<AnnouncementPage>(query('/api/v1/announcements', params)),
  create: (input: { title: string; body: string }) => data<{ announcement: Omit<AnnouncementDto, 'latestVersion'>; version: AnnouncementVersionDto }>('/api/v1/announcements', write('POST', input)),
  detail: (id: string) => data<AnnouncementDetailDto>(`/api/v1/announcements/${id}`),
  archive: (id: string) => data<Omit<AnnouncementDto, 'latestVersion'>>(`/api/v1/announcements/${id}`, write('PATCH', { status: 'ARCHIVED' })),
  versions: (id: string, page = 1) => apiRequest<AnnouncementVersionPage>(query(`/api/v1/announcements/${id}/versions`, { page, pageSize: 50 })),
  createVersion: (id: string, input: { title: string; body: string }) => data<AnnouncementVersionDto>(`/api/v1/announcements/${id}/versions`, write('POST', input)),
  targets: (id: string, announcementVersionId?: string) => data<AnnouncementTargetDto[]>(query(`/api/v1/announcements/${id}/targets`, { announcementVersionId })),
  addTargets: (id: string, announcementVersionId: string, targets: AnnouncementTargetInput[]) => data<AnnouncementTargetDto[]>(`/api/v1/announcements/${id}/targets`, write('POST', { announcementVersionId, targets })),
  publications: (id: string, page = 1, pageSize = 20) => apiRequest<AnnouncementPublicationPage>(query(`/api/v1/announcements/${id}/publications`, { page, pageSize })),
  publish: (id: string, announcementVersionId: string, scheduledAt?: string) => data<AnnouncementPublishDto>(`/api/v1/announcements/${id}/publish`, write('POST', { announcementVersionId, idempotencyKey: crypto.randomUUID(), ...(scheduledAt ? { scheduledAt } : {}) })),
};

export async function allAnnouncementPublications(id: string) {
  const first = await announcementsApi.publications(id, 1, 100); const rows = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) rows.push(...(await announcementsApi.publications(id, page, 100)).data);
  return rows;
}

/** Current-user authoring scope only; never used to resolve publication recipients. */
export async function currentUserAnnouncementAssignments(userId: string): Promise<TeacherAssignmentDto[]> {
  const first = await teachersApi.list({ status: 'ACTIVE', page: 1, pageSize: 100 }); const teachers: TeacherDto[] = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) teachers.push(...(await teachersApi.list({ status: 'ACTIVE', page, pageSize: 100 })).data);
  const owned = teachers.filter((teacher) => teacher.userId === userId);
  return (await Promise.all(owned.map((teacher) => listAllAssignments(teacher.id, { status: 'ACTIVE' })))).flat();
}
