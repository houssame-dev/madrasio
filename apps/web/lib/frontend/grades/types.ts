export type GradebookStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
export type AssessmentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type AssessmentType = 'QUIZ' | 'TEST' | 'EXAM' | 'ORAL' | 'PROJECT' | 'HOMEWORK';

export interface PageMeta { page: number; pageSize: number; total: number }
export interface PageResponse<T> { data: T[]; meta: PageMeta }
export interface DataResponse<T> { data: T }

export interface GradebookDto {
  id: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
  name: string | null;
  status: GradebookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GradingConfigurationVersionOptionDto {
  id: string;
  versionNumber: number;
  configuration: { id: string; name: string };
}

export interface GradebookInput {
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
  name?: string | null;
}

export interface AssessmentDto {
  id: string;
  gradebookId: string;
  title: string;
  assessmentType: AssessmentType;
  maximumScore: string;
  weight: string;
  status: AssessmentStatus;
  assessmentDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GradebookListParams {
  page: number;
  pageSize: number;
  academicYearId?: string;
  academicPeriodId?: string;
  classId?: string;
  subjectId?: string;
  gradingConfigurationVersionId?: string;
  status?: GradebookStatus;
}

export interface AssessmentListParams {
  page: number;
  pageSize: number;
  status?: AssessmentStatus;
  assessmentType?: AssessmentType;
  dateFrom?: string;
  dateTo?: string;
}

export interface AssessmentInput {
  title: string;
  assessmentType: AssessmentType;
  maximumScore: string;
  weight: string;
  assessmentDate?: string | null;
}
