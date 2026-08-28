import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';

export const schoolId = '00000000-0000-4000-8000-000000000701'; export const userId = '00000000-0000-4000-8000-000000000702'; export const announcementId = '00000000-0000-4000-8000-000000000703'; export const versionId = '00000000-0000-4000-8000-000000000704'; export const yearId = '00000000-0000-4000-8000-000000000705'; export const classId = '00000000-0000-4000-8000-000000000706'; export const targetId = '00000000-0000-4000-8000-000000000707'; export const publicationId = '00000000-0000-4000-8000-000000000708';
export const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
export const version = { id: versionId, announcementId, versionNumber: 1, title: 'School closure', body: 'The School will close tomorrow.', createdBy: userId, ...timestamps };
export const announcement = { id: announcementId, status: 'DRAFT' as const, createdBy: userId, latestVersion: version, ...timestamps };
export const detail = { announcement: { id: announcementId, status: 'DRAFT' as const, createdBy: userId, ...timestamps }, latestVersion: version, targetSummary: { count: 0, audiences: [], targetTypes: [] }, publicationSummary: { count: 0, latest: null } };
export const year = { id: yearId, name: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', status: 'ACTIVE' as const, ...timestamps };
export const schoolClass = { id: classId, academicYearId: yearId, stageId: crypto.randomUUID(), levelId: crypto.randomUUID(), trackId: null, curriculumVersionId: crypto.randomUUID(), name: 'Class A', status: 'ACTIVE' as const, ...timestamps };
export const page = <T,>(data: T[], pageNumber = 1, pageSize = 20) => ({ data, meta: { page: pageNumber, pageSize, total: data.length } });
export function renderAnnouncements(ui: ReactElement, role: Role = 'SCHOOL_ADMIN'): RenderResult { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>{ui}</AppContextProvider></QueryClientProvider>); }
