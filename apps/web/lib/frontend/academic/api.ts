import { apiRequest } from '@/lib/frontend/api-client';
import type {
  AcademicPeriodDto, AcademicYearDto, ClassDto, CurriculumDto, CurriculumSubjectDto,
  CurriculumVersionDto, DataResponse, LevelDto, ListParams, OrderedStructureDto,
  PageResponse, SubjectDto,
} from './types';

function withQuery(path: `/api/v1/${string}`, params: ListParams = {}): `/api/v1/${string}` {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`;
}

export function listResource<T>(path: `/api/v1/${string}`, params?: ListParams) {
  return apiRequest<PageResponse<T>>(withQuery(path, params));
}

export async function listAllResource<T>(path: `/api/v1/${string}`, params: Omit<ListParams, 'page' | 'pageSize'> = {}): Promise<T[]> {
  const first = await listResource<T>(path, { ...params, page: 1, pageSize: 100 });
  const rows = [...first.data];
  const pageCount = Math.ceil(first.meta.total / 100);
  for (let page = 2; page <= pageCount; page += 1) {
    rows.push(...(await listResource<T>(path, { ...params, page, pageSize: 100 })).data);
  }
  return rows;
}

export const academicApi = {
  years: (params?: ListParams) => listResource<AcademicYearDto>('/api/v1/academic-years', params),
  allYears: () => listAllResource<AcademicYearDto>('/api/v1/academic-years'),
  periods: (yearId: string, params?: ListParams) => listResource<AcademicPeriodDto>(`/api/v1/academic-years/${yearId}/periods`, params),
  stages: (params?: ListParams) => listResource<OrderedStructureDto>('/api/v1/stages', params),
  allStages: () => listAllResource<OrderedStructureDto>('/api/v1/stages'),
  levels: (params?: ListParams) => listResource<LevelDto>('/api/v1/levels', params),
  allLevels: () => listAllResource<LevelDto>('/api/v1/levels'),
  tracks: (params?: ListParams) => listResource<OrderedStructureDto>('/api/v1/tracks', params),
  allTracks: () => listAllResource<OrderedStructureDto>('/api/v1/tracks'),
  subjects: (params?: ListParams) => listResource<SubjectDto>('/api/v1/subjects', params),
  allSubjects: () => listAllResource<SubjectDto>('/api/v1/subjects'),
  curricula: (params?: ListParams) => listResource<CurriculumDto>('/api/v1/curricula', params),
  allCurricula: () => listAllResource<CurriculumDto>('/api/v1/curricula'),
  versions: (curriculumId: string, params?: ListParams) => listResource<CurriculumVersionDto>(`/api/v1/curricula/${curriculumId}/versions`, params),
  curriculumSubjects: (versionId: string, params?: ListParams) => listResource<CurriculumSubjectDto>(`/api/v1/curriculum-versions/${versionId}/subjects`, params),
  allCurriculumSubjects: (versionId: string) => listAllResource<CurriculumSubjectDto>(`/api/v1/curriculum-versions/${versionId}/subjects`),
  classes: (params?: ListParams) => listResource<ClassDto>('/api/v1/classes', params),
};

export async function mutateResource<T>(path: `/api/v1/${string}`, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return (await apiRequest<DataResponse<T>>(path, { method, body: JSON.stringify(body) })).data;
}

export interface VersionOption extends CurriculumVersionDto { curriculumName: string }

export async function listAllVersions(): Promise<VersionOption[]> {
  const curricula = await academicApi.allCurricula();
  const groups = await Promise.all(curricula.map(async (curriculum) =>
    (await listAllResource<CurriculumVersionDto>(`/api/v1/curricula/${curriculum.id}/versions`))
      .map((version) => ({ ...version, curriculumName: curriculum.name }))));
  return groups.flat();
}
