export type GradebookStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
export type AssessmentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type AssessmentType = 'QUIZ' | 'TEST' | 'EXAM' | 'ORAL' | 'PROJECT' | 'HOMEWORK';
export type GradeState = 'VALID' | 'MISSING' | 'ABSENT' | 'EXCUSED';
export type ResultType = 'SUBJECT' | 'PERIOD' | 'ANNUAL';
export type ResultStatus = 'CALCULATED' | 'FINALIZED';

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

export interface GradeDto {
  id: string;
  gradebookId: string;
  assessmentId: string;
  studentId: string;
  score: string | null;
  state: GradeState;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixStudentDto {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentCode: string | null;
    status: string;
  };
  grades: GradeDto[];
}

export interface GradeMatrixResponse {
  data: {
    gradebook: GradebookDto;
    assessments: AssessmentDto[];
    students: MatrixStudentDto[];
  };
  meta: PageMeta & { assessmentLimit: number; assessmentTotal: number };
}

export interface GradeEntryInput {
  studentId: string;
  state: GradeState;
  score: string | null;
}

export interface ResultDto {
  id: string;
  resultType: ResultType;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  subjectId: string | null;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResultListParams {
  page: number;
  pageSize: number;
  studentId?: string;
  academicYearId?: string;
  academicPeriodId?: string;
  classId?: string;
  subjectId?: string;
  status?: ResultStatus;
}

export interface ResultPublicationDto {
  publicationId: string;
  resultType: ResultType;
  resultId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  resultValue: string;
  gradingConfigurationVersionId: string;
  publicationVersion: number;
  publishedAt: string;
}
