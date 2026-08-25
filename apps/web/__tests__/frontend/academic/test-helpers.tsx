import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000001';
export const yearId = '00000000-0000-4000-8000-000000000010';
export const stageId = '00000000-0000-4000-8000-000000000020';
export const levelId = '00000000-0000-4000-8000-000000000030';
export const trackId = '00000000-0000-4000-8000-000000000040';
export const curriculumId = '00000000-0000-4000-8000-000000000050';
export const versionId = '00000000-0000-4000-8000-000000000060';
export const subjectId = '00000000-0000-4000-8000-000000000070';

export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

export function page<T>(data: T[], pageNumber = 1, pageSize = 20, total = data.length) {
  return { data, meta: { page: pageNumber, pageSize, total } };
}

export function renderAcademic(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}><AppContextProvider value={{ user: { id: 'user' }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>);
  return Object.assign(result, { queryClient });
}
