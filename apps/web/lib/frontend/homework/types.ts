import type { PageResponse, Timestamps } from '@/lib/frontend/academic/types';
import type { StudentDto } from '@/lib/frontend/students/types';

export type HomeworkStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
export type HomeworkSubmissionStatus = 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED';

export interface HomeworkDto extends Timestamps {
  id: string;
  teacherId: string;
  subjectId: string;
  academicYearId: string;
  academicPeriodId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: HomeworkStatus;
}

export interface HomeworkTargetDto extends Timestamps {
  id: string;
  homeworkId: string;
  targetType: 'CLASS';
  academicYearId: string;
  classId: string;
}

export interface HomeworkSubmissionDto extends Timestamps {
  id: string;
  homeworkId: string;
  studentId: string;
  submittedAt: string;
  content: string | null;
  status: HomeworkSubmissionStatus;
}

export interface HomeworkRosterSubmissionDto {
  id: string;
  submittedAt: string;
  content: string | null;
  status: HomeworkSubmissionStatus;
  updatedAt: string;
}

export interface HomeworkRosterRowDto {
  student: StudentDto;
  submission: HomeworkRosterSubmissionDto | null;
}

export type HomeworkRosterResponse = PageResponse<HomeworkRosterRowDto>;

export interface HomeworkListParams {
  page?: number;
  pageSize?: number;
  status?: HomeworkStatus;
  classId?: string;
  academicYearId?: string;
  dueFrom?: string;
  dueTo?: string;
  search?: string;
}

export interface HomeworkSubmissionListParams {
  page?: number;
  pageSize?: number;
  status?: HomeworkSubmissionStatus;
  studentId?: string;
}

export interface HomeworkCreateInput {
  subjectId: string;
  academicYearId: string;
  academicPeriodId: string;
  title: string;
  description: string | null;
  dueDate: string;
}

export interface HomeworkPatchInput {
  title?: string;
  description?: string | null;
  dueDate?: string;
  status?: HomeworkStatus;
}

