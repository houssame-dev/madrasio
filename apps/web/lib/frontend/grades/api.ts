import { apiRequest } from '@/lib/frontend/api-client';
import type {
  AssessmentDto, AssessmentInput, AssessmentListParams, DataResponse, GradebookDto,
  GradebookInput, GradebookListParams, GradebookStatus,
  GradeEntryInput, GradeMatrixResponse, GradingConfigurationVersionOptionDto,
  PageResponse, ResultDto, ResultListParams, ResultPublicationDto, ResultType,
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
const put = (value: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(value) });

export const gradesApi = {
  gradebooks: (params: GradebookListParams) => apiRequest<PageResponse<GradebookDto>>(query('/api/v1/gradebooks', params)),
  allGradebooks: async () => {
    const first = await apiRequest<PageResponse<GradebookDto>>(query('/api/v1/gradebooks', { page: 1, pageSize: 100 }));
    const rows = [...first.data]; const pages = Math.ceil(first.meta.total / 100);
    for (let page = 2; page <= pages; page += 1) rows.push(...(await apiRequest<PageResponse<GradebookDto>>(query('/api/v1/gradebooks', { page, pageSize: 100 }))).data);
    return rows;
  },
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
  gradeMatrix: (gradebookId: string, params: { page: number; pageSize: number }) => apiRequest<GradeMatrixResponse>(query(`/api/v1/gradebooks/${gradebookId}/grades`, params)),
  allGradebookStudents: async (gradebookId: string) => {
    const first = await apiRequest<GradeMatrixResponse>(query(`/api/v1/gradebooks/${gradebookId}/grades`, { page: 1, pageSize: 100 }));
    const students = [...first.data.students]; const pages = Math.ceil(first.meta.total / 100);
    for (let page = 2; page <= pages; page += 1) students.push(...(await apiRequest<GradeMatrixResponse>(query(`/api/v1/gradebooks/${gradebookId}/grades`, { page, pageSize: 100 }))).data.students);
    return students;
  },
  putAssessmentGrades: (assessmentId: string, grades: GradeEntryInput[]) => data<{ grades: import('./types').GradeDto[] }>(`/api/v1/assessments/${assessmentId}/grades`, put({ grades })),
  results: (resultType: ResultType, params: ResultListParams) => apiRequest<PageResponse<ResultDto>>(query(`/api/v1/results/${resultType === 'SUBJECT' ? 'subjects' : resultType === 'PERIOD' ? 'periods' : 'annual'}`, params)),
  result: (resultType: ResultType, resultId: string) => data<ResultDto>(query(`/api/v1/results/${resultId}`, { resultType })),
  calculateSubject: (input: { gradebookId: string; studentId: string }) => data<ResultDto>('/api/v1/results/subjects/calculate', post(input)),
  calculatePeriod: (input: { studentId: string; academicYearId: string; academicPeriodId: string; classId: string }) => data<ResultDto>('/api/v1/results/periods/calculate', post(input)),
  calculateAnnual: (input: { studentId: string; academicYearId: string; classId: string }) => data<ResultDto>('/api/v1/results/annual/calculate', post(input)),
  finalizeResult: (resultType: ResultType, resultId: string) => data<ResultDto>(`/api/v1/results/${resultId}/finalize`, post({ resultType })),
  publishResult: (resultType: ResultType, resultId: string, idempotencyKey: string) => data<ResultPublicationDto>(`/api/v1/results/${resultId}/publish`, post({ resultType, idempotencyKey })),
  reviseResult: (resultType: ResultType, resultId: string, idempotencyKey: string) => data<ResultPublicationDto>(`/api/v1/results/${resultId}/revise`, post({ resultType, idempotencyKey })),
};
