import { apiRequest } from '@/lib/frontend/api-client';
import type {
  AssessmentDto, AssessmentInput, AssessmentListParams, DataResponse, GradebookDto,
  GradebookInput, GradebookListParams, GradebookStatus,
  GradingConfigurationVersionOptionDto, PageResponse,
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

const patch = (value: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(value) });
const post = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) });

export const gradesApi = {
  gradebooks: (params: GradebookListParams) => apiRequest<PageResponse<GradebookDto>>(query('/api/v1/gradebooks', params)),
  createGradebook: (input: GradebookInput) => data<GradebookDto>('/api/v1/gradebooks', post(input)),
  configurationVersions: (params: { page: number; pageSize: number }) => apiRequest<PageResponse<GradingConfigurationVersionOptionDto>>(query('/api/v1/grading-configuration-versions', params)),
  allConfigurationVersions: async () => {
    const first = await apiRequest<PageResponse<GradingConfigurationVersionOptionDto>>(query('/api/v1/grading-configuration-versions', { page: 1, pageSize: 100 }));
    const rows = [...first.data];
    const pages = Math.ceil(first.meta.total / 100);
    for (let page = 2; page <= pages; page += 1) rows.push(...(await apiRequest<PageResponse<GradingConfigurationVersionOptionDto>>(query('/api/v1/grading-configuration-versions', { page, pageSize: 100 }))).data);
    return rows;
  },
  gradebook: (gradebookId: string) => data<GradebookDto>(`/api/v1/gradebooks/${gradebookId}`),
  patchGradebook: (gradebookId: string, input: { name?: string | null; status?: GradebookStatus }) => data<GradebookDto>(`/api/v1/gradebooks/${gradebookId}`, patch(input)),
  assessments: (gradebookId: string, params: AssessmentListParams) => apiRequest<PageResponse<AssessmentDto>>(query(`/api/v1/gradebooks/${gradebookId}/assessments`, params)),
  assessment: (assessmentId: string) => data<AssessmentDto>(`/api/v1/assessments/${assessmentId}`),
  createAssessment: (gradebookId: string, input: AssessmentInput) => data<AssessmentDto>(`/api/v1/gradebooks/${gradebookId}/assessments`, post(input)),
  patchAssessment: (assessmentId: string, input: Partial<AssessmentInput> & { status?: AssessmentDto['status'] }) => data<AssessmentDto>(`/api/v1/assessments/${assessmentId}`, patch(input)),
};
