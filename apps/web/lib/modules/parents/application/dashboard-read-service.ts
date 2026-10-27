import 'server-only';
import { and, asc, count, eq, exists, gte, isNull, lte, or } from 'drizzle-orm';
import * as s from '@school/database';
import { listChildAcademicYears } from './parent-child-read-service';
import { ParentDomainError } from './parent-errors';
import type { ParentsDb } from '../infrastructure/repositories/parent-repository';
import type { Actor } from './parent-service';
import { schoolToday } from '@/lib/modules/finance/domain/contracts';
import type { ParentWeekOverview } from '@/lib/frontend/parent-portal/dashboard-types';

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10);
/** Bounded reads reuse the existing due-date/historical enrollment predicates. No submission state is inferred. */
export async function parentWeekOverview(db: ParentsDb, actor: Actor, studentId: string, academicYearId: string, now = new Date()): Promise<ParentWeekOverview> {
  const years = await listChildAcademicYears(db, actor, studentId); // Canonical role, school, active Parent and relationship checks.
  if (!years.data.some(y => y.id === academicYearId)) throw new ParentDomainError('ACADEMIC_CONTEXT_NOT_AVAILABLE', 'Academic context is not available.');
  const [school] = await db.select({ timezone: s.schools.timezone }).from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (!school) throw new ParentDomainError('ACADEMIC_CONTEXT_NOT_AVAILABLE', 'Academic context is not available.');
  const date = schoolToday(school.timezone, now), from = shift(date,-6), through = shift(date,7);
  const h = s.homework, e = s.studentEnrollments, target = s.homeworkTargets, a = s.attendanceRecords;
  const eligibleHomework = and(eq(h.schoolId, actor.schoolId), eq(h.academicYearId, academicYearId), eq(h.status, 'PUBLISHED'), gte(h.dueDate,date), lte(h.dueDate,through),
    exists(db.select({ id:e.id }).from(e).innerJoin(target,and(eq(target.schoolId,actor.schoolId),eq(target.homeworkId,h.id),eq(target.classId,e.classId),eq(target.academicYearId,e.academicYearId)))
      .where(and(eq(e.schoolId,actor.schoolId),eq(e.studentId,studentId),eq(e.academicYearId,h.academicYearId),lte(e.effectiveFrom,h.dueDate),or(isNull(e.effectiveUntil),gte(e.effectiveUntil,h.dueDate))))));
  const absenceScope = and(eq(a.schoolId,actor.schoolId),eq(a.studentId,studentId),eq(a.academicYearId,academicYearId),eq(a.status,'ABSENT'),gte(a.attendanceDate,from),lte(a.attendanceDate,date),
    exists(db.select({ id:e.id }).from(e).where(and(eq(e.schoolId,actor.schoolId),eq(e.studentId,studentId),eq(e.classId,a.classId),eq(e.academicYearId,a.academicYearId),lte(e.effectiveFrom,a.attendanceDate),or(isNull(e.effectiveUntil),gte(e.effectiveUntil,a.attendanceDate))))));
  const [homework,[upcoming],[absences]] = await Promise.all([
    db.select({ id:h.id,title:h.title,description:h.description,dueDate:h.dueDate,status:h.status,subjectName:s.subjects.name,periodName:s.academicPeriods.name }).from(h)
      .innerJoin(s.subjects,and(eq(s.subjects.schoolId,actor.schoolId),eq(s.subjects.id,h.subjectId)))
      .innerJoin(s.academicPeriods,and(eq(s.academicPeriods.schoolId,actor.schoolId),eq(s.academicPeriods.id,h.academicPeriodId)))
      .where(eligibleHomework).orderBy(asc(h.dueDate),asc(h.id)).limit(4),
    db.select({ value:count() }).from(h).where(eligibleHomework),
    db.select({ value:count() }).from(a).where(absenceScope),
  ]);
  return { date, timezone:school.timezone, asOf:now.toISOString(), from, through, upcomingCount:upcoming.value, absenceRecords:absences.value, homework };
}
