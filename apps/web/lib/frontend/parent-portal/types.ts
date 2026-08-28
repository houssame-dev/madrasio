import type { ParentBootstrapProfile } from '@/lib/frontend/parents/types';

export interface ParentChildView {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string | null;
}

export interface ChildAcademicYear {
  id: string;
  name: string;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  startDate: string;
  endDate: string;
}

export interface ChildPlacement {
  effectiveFrom: string;
  effectiveUntil: string | null;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  levelId: string;
  levelName: string;
  stageId: string;
  stageName: string;
  trackId: string | null;
  trackName: string | null;
}

export type ParentResultType = 'SUBJECT' | 'PERIOD' | 'ANNUAL';
export interface ParentPublishedResult {
  publicationId: string;
  resultId: string;
  resultType: ParentResultType;
  value: string;
  publicationVersion: number;
  publishedAt: string;
  academicYear: { id: string; name: string };
  academicPeriod: { id: string; name: string } | null;
  class: { id: string; name: string };
  subject: { id: string; name: string; code: string | null } | null;
}

export interface ParentResultPage {
  data: ParentPublishedResult[];
  meta: { page: number; pageSize: number; total: number };
}

export function relatedChildren(profiles: ParentBootstrapProfile[]): ParentChildView[] {
  const children = new Map<string, ParentChildView>();
  for (const profile of profiles) {
    for (const { student } of profile.children) {
      if (!children.has(student.id)) children.set(student.id, { ...student });
    }
  }
  return [...children.values()].sort((a, b) => a.lastName.localeCompare(b.lastName)
    || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id));
}

export function childHref(studentId: string): string {
  return `/children/${studentId}`;
}
