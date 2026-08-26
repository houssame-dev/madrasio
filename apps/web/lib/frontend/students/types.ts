import type { PageMeta, PageResponse, Timestamps } from '@/lib/frontend/academic/types';

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN' | 'ARCHIVED';
export type EnrollmentStatus = 'ACTIVE' | 'ENDED';

export interface StudentDto extends Timestamps {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string | null;
  status: StudentStatus;
}

export interface EnrollmentDto extends Timestamps {
  id: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: EnrollmentStatus;
}

export interface TransferResult {
  previousEnrollment: EnrollmentDto;
  currentEnrollment: EnrollmentDto;
}

export interface StudentListParams {
  page?: number;
  pageSize?: number;
  status?: StudentStatus;
  search?: string;
  studentCode?: string;
  academicYearId?: string;
  classId?: string;
}

export interface EnrollmentListParams {
  page?: number;
  pageSize?: number;
  academicYearId?: string;
}

export type { PageMeta, PageResponse };
export interface DataResponse<T> { data: T }
