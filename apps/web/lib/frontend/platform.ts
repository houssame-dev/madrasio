import { apiRequest } from './api-client';
import type { AdminSummary, SchoolSummary } from '@/lib/modules/platform/contracts';
export const platformKeys = {
  schools: ['platform', 'schools'] as const,
  school: (id: string) => ['platform', 'school', id] as const,
  admins: (id: string) => ['platform', 'school', id, 'admins'] as const,
};
const base = '/api/v1/platform/schools' as const;
export const platformApi = {
  list: (page: number) =>
    apiRequest<{ data: SchoolSummary[]; meta: { total: number } }>(`${base}?page=${page}`),
  school: (id: string) => apiRequest<{ data: SchoolSummary }>(`${base}/${id}`).then((r) => r.data),
  admins: (id: string) =>
    apiRequest<{ data: AdminSummary[] }>(`${base}/${id}/admins`).then((r) => r.data),
  create: (input: { name: string; timezone: string }) =>
    apiRequest<{ data: SchoolSummary }>(base, { method: 'POST', body: JSON.stringify(input) }).then(
      (r) => r.data,
    ),
  invite: (id: string, input: { email: string }) =>
    apiRequest<{ data: { state: 'INVITED' | 'LINKED' | 'ALREADY_LINKED' } }>(
      `${base}/${id}/admins`,
      { method: 'POST', body: JSON.stringify(input) },
    ).then((r) => r.data),
  status: (schoolId: string, membershipId: string, status: 'ACTIVE' | 'INACTIVE') =>
    apiRequest(`${base}/${schoolId}/admins/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};
