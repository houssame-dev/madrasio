import type { PageMeta, PageResponse, Timestamps } from '@/lib/frontend/academic/types';

export type TeacherStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type AssignmentStatus = 'ACTIVE' | 'ENDED';

export interface TeacherDto extends Timestamps {
  id: string;
  firstName: string;
  lastName: string;
  teacherCode: string | null;
  userId: string | null;
  status: TeacherStatus;
}

export interface TeacherAssignmentDto extends Timestamps {
  id: string;
  teacherId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: AssignmentStatus;
}

export interface TeacherListParams {
  page?: number;
  pageSize?: number;
  status?: TeacherStatus;
  search?: string;
  teacherCode?: string;
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
}

export interface AssignmentListParams {
  page?: number;
  pageSize?: number;
  status?: AssignmentStatus;
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
}

export interface DataResponse<T> { data: T }
export type { PageMeta, PageResponse };
