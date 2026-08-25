export type ActiveStatus = 'ACTIVE' | 'INACTIVE';
export type YearStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type PeriodStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type CurriculumStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type VersionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ClassStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface PageMeta { page: number; pageSize: number; total: number }
export interface PageResponse<T> { data: T[]; meta: PageMeta }
export interface DataResponse<T> { data: T }
export interface Timestamps { createdAt: string; updatedAt: string }

export interface AcademicYearDto extends Timestamps {
  id: string; name: string; startDate: string; endDate: string; status: YearStatus;
}
export interface AcademicPeriodDto extends Timestamps {
  id: string; academicYearId: string; name: string; sequence: number;
  startDate: string; endDate: string; status: PeriodStatus;
}
export interface OrderedStructureDto extends Timestamps {
  id: string; name: string; sequence: number; status: ActiveStatus;
}
export interface LevelDto extends OrderedStructureDto { stageId: string }
export interface SubjectDto extends Timestamps {
  id: string; name: string; code: string | null; status: ActiveStatus;
}
export interface CurriculumDto extends Timestamps {
  id: string; name: string; status: CurriculumStatus;
}
export interface CurriculumVersionDto extends Timestamps {
  id: string; curriculumId: string; name: string; status: VersionStatus;
}
export interface CurriculumSubjectDto extends Timestamps {
  id: string; curriculumVersionId: string; subjectId: string; subjectName: string;
  subjectCode: string | null; coefficient: string; displayOrder: number | null; status: ActiveStatus;
}
export interface ClassDto extends Timestamps {
  id: string; academicYearId: string; stageId: string; levelId: string;
  trackId: string | null; curriculumVersionId: string; name: string; status: ClassStatus;
}

export interface ListParams {
  page?: number; pageSize?: number; status?: string; search?: string;
  stageId?: string; academicYearId?: string; levelId?: string; trackId?: string;
}
