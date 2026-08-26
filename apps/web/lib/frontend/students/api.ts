import { apiRequest } from '@/lib/frontend/api-client';
import type {
  DataResponse, EnrollmentDto, EnrollmentListParams, PageResponse, StudentDto,
  StudentListParams, TransferResult,
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

export const studentsApi = {
  list: (params: StudentListParams) => apiRequest<PageResponse<StudentDto>>(query('/api/v1/students', params)),
  detail: (studentId: string) => data<StudentDto>(`/api/v1/students/${studentId}`),
  create: (input: { firstName: string; lastName: string; studentCode?: string | null }) => data<StudentDto>('/api/v1/students', body('POST', input)),
  patch: (studentId: string, input: Partial<Pick<StudentDto, 'firstName' | 'lastName' | 'studentCode' | 'status'>>) => data<StudentDto>(`/api/v1/students/${studentId}`, body('PATCH', input)),
  enrollments: (studentId: string, params: EnrollmentListParams) => apiRequest<PageResponse<EnrollmentDto>>(query(`/api/v1/students/${studentId}/enrollments`, params)),
  currentEnrollment: (studentId: string, academicYearId: string) => data<EnrollmentDto | null>(query(`/api/v1/students/${studentId}/enrollments/current`, { academicYearId })),
  createEnrollment: (studentId: string, input: { academicYearId: string; classId: string; effectiveFrom: string }) => data<EnrollmentDto>(`/api/v1/students/${studentId}/enrollments`, body('POST', input)),
  transfer: (studentId: string, input: { academicYearId: string; toClassId: string; effectiveDate: string }) => data<TransferResult>(`/api/v1/students/${studentId}/transfer`, body('POST', input)),
  endEnrollment: (enrollmentId: string, input: { effectiveUntil: string }) => data<EnrollmentDto>(`/api/v1/student-enrollments/${enrollmentId}/end`, body('POST', input)),
};
