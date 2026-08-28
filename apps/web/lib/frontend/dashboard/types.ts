import type { AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import type { TeacherAssignmentDto, TeacherDto } from '@/lib/frontend/teachers/types';

export interface TeacherAssignmentView extends TeacherAssignmentDto {
  academicYearName: string;
  className: string;
  subjectName: string;
}

export interface TeacherClassView {
  key: string;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  assignments: TeacherAssignmentView[];
}

export interface TeacherDashboardScope {
  profiles: TeacherDto[];
  assignments: TeacherAssignmentDto[];
}

export interface AssignmentLabelFallbacks {
  academicYear: string;
  className: string;
  subject: string;
}

export function assignmentViews(
  assignments: TeacherAssignmentDto[],
  years: AcademicYearDto[],
  classes: ClassDto[],
  subjects: SubjectDto[],
  fallbacks: AssignmentLabelFallbacks,
): TeacherAssignmentView[] {
  const yearNames = new Map(years.map((item) => [item.id, item.name]));
  const classNames = new Map(classes.map((item) => [item.id, item.name]));
  const subjectNames = new Map(subjects.map((item) => [item.id, item.name]));
  return assignments
    .filter((item) => item.status === 'ACTIVE')
    .map((item) => ({
      ...item,
      academicYearName: yearNames.get(item.academicYearId) ?? fallbacks.academicYear,
      className: classNames.get(item.classId) ?? fallbacks.className,
      subjectName: subjectNames.get(item.subjectId) ?? fallbacks.subject,
    }));
}

export function groupTeacherClasses(assignments: TeacherAssignmentView[]): TeacherClassView[] {
  const groups = new Map<string, TeacherClassView>();
  for (const assignment of assignments) {
    const key = `${assignment.academicYearId}:${assignment.classId}`;
    const group = groups.get(key) ?? {
      key,
      academicYearId: assignment.academicYearId,
      academicYearName: assignment.academicYearName,
      classId: assignment.classId,
      className: assignment.className,
      assignments: [],
    };
    if (!group.assignments.some((item) => item.subjectId === assignment.subjectId)) group.assignments.push(assignment);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, assignments: group.assignments.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.academicYearName.localeCompare(b.academicYearName) || a.className.localeCompare(b.className) || a.key.localeCompare(b.key));
}

export function attendanceHref(academicYearId: string, classId: string, date: string): string {
  return `/attendance?${new URLSearchParams({ section: 'daily', academicYearId, classId, date })}`;
}

export function gradesHref(assignment: Pick<TeacherAssignmentDto, 'academicYearId' | 'classId' | 'subjectId'>): string {
  return `/grades?${new URLSearchParams({ academicYearId: assignment.academicYearId, classId: assignment.classId, subjectId: assignment.subjectId })}`;
}

/** Task 033 supports Year and Class list filters, but no Subject filter. */
export function homeworkHref(assignment: Pick<TeacherAssignmentDto, 'academicYearId' | 'classId'>): string {
  return `/homework?${new URLSearchParams({ academicYearId: assignment.academicYearId, classId: assignment.classId })}`;
}
