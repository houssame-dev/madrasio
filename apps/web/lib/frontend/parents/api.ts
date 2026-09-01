import { apiRequest } from '@/lib/frontend/api-client';
import type { DataResponse, PageResponse, ParentBootstrapProfile, ParentDto, ParentListParams, ParentRelationshipDto, RelationshipListParams } from './types';

function query(path: `/api/v1/${string}`, params: object = {}): `/api/v1/${string}` { const values = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') values.set(key, String(value)); const suffix = values.toString(); return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`; }
async function data<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> { return (await apiRequest<DataResponse<T>>(path, init)).data; }
const body = (method: 'POST' | 'PATCH', value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

export const parentsApi = {
  list: (params: ParentListParams) => apiRequest<PageResponse<ParentDto>>(query('/api/v1/parents', params)),
  detail: (parentId: string) => data<ParentDto>(`/api/v1/parents/${parentId}`),
  create: (input: { firstName: string; lastName: string; parentCode?: string | null; userId?: string | null }) => data<ParentDto>('/api/v1/parents', body('POST', input)),
  patch: (parentId: string, input: Partial<Pick<ParentDto, 'firstName' | 'lastName' | 'parentCode' | 'userId' | 'status'>>) => data<ParentDto>(`/api/v1/parents/${parentId}`, body('PATCH', input)),
  inviteAccount: (parentId: string, email: string) => data<{ profileId: string; userId: string; state: 'INVITED' | 'LINKED' | 'ALREADY_LINKED' }>(`/api/v1/parents/${parentId}/invite-account`, body('POST', { email })),
  relationships: (parentId: string, params: RelationshipListParams) => apiRequest<PageResponse<ParentRelationshipDto>>(query(`/api/v1/parents/${parentId}/students`, params)),
  createRelationship: (parentId: string, input: { studentId: string }) => data<ParentRelationshipDto>(`/api/v1/parents/${parentId}/students`, body('POST', input)),
  endRelationship: (relationshipId: string) => data<ParentRelationshipDto>(`/api/v1/parent-student-relationships/${relationshipId}/end`, body('POST', {})),
  selfProfiles: () => apiRequest<DataResponse<ParentBootstrapProfile[]>>('/api/v1/me/parent-profiles').then((value) => value.data),
};

export async function listAllActiveRelationships(parentId: string): Promise<ParentRelationshipDto[]> {
  const first = await parentsApi.relationships(parentId, { status: 'ACTIVE', page: 1, pageSize: 100 }); const rows = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) rows.push(...(await parentsApi.relationships(parentId, { status: 'ACTIVE', page, pageSize: 100 })).data);
  return rows;
}
