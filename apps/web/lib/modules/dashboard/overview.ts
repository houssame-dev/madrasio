import { schoolHolidaysOnDate } from '@/lib/modules/school-holidays/service';
import 'server-only';
import { and, countDistinct, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import * as s from '@school/database';
import { schoolWallTimeToInstant } from '@school/shared';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schoolToday } from '@/lib/modules/finance/domain/contracts';
import { collectionsReport, outstandingReport } from '@/lib/modules/finance/application/reports';
import { applicablePublications } from '@/lib/modules/timetable/domain/publication';
import type { AdminLesson, AdminOverview, WorkspaceContext } from '@/lib/frontend/dashboard/admin-types';

type Db = NodePgDatabase<typeof s>;
type Actor = { schoolId: string; userId: string };
export async function workspaceContext(db: Db, actor: Actor, now = new Date()): Promise<WorkspaceContext> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'school.read', scope: { kind: 'school' } });
  const [school] = await db.select({ timezone: s.schools.timezone, status: s.schools.status }).from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (!school || school.status !== 'ACTIVE') throw new ForbiddenError();
  const date = schoolToday(school.timezone, now);
  const years = await db.select({ id: s.academicYears.id, name: s.academicYears.name }).from(s.academicYears).where(and(eq(s.academicYears.schoolId, actor.schoolId), eq(s.academicYears.status, 'ACTIVE'), lte(s.academicYears.startDate, date), gte(s.academicYears.endDate, date))).limit(2);
  // Overlapping ACTIVE years are ambiguous: do not invent a current one.
  return { date, timezone: school.timezone, academicYear: years.length === 1 ? years[0] : null };
}
export function lessonStatus(date: string, start: string, end: string, timezone: string, now: Date): AdminLesson['status'] {
  try {
    const from = Date.parse(schoolWallTimeToInstant(`${date}T${start}:00`, timezone));
    const to = Date.parse(schoolWallTimeToInstant(`${date}T${end}:00`, timezone));
    return now.getTime() < from ? 'upcoming' : now.getTime() < to ? 'ongoing' : 'completed';
  } catch { return 'unavailable'; }
}
export function recordingStatus(status: AdminLesson['status'], expected: number, recorded: number): AdminLesson['recording'] {
  if (status === 'unavailable') return 'unavailable';
  if (expected === 0) return 'noRoster';
  if (status === 'upcoming') return 'upcoming';
  return recorded >= expected ? 'recorded' : 'pending';
}
export async function adminOverview(db: Db, actor: Actor, requestedYear?: string, now = new Date()): Promise<AdminOverview> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'finance.read', scope: { kind: 'school' } });
  const context = await workspaceContext(db, actor, now);
  const years = await db.select({ id: s.academicYears.id, name: s.academicYears.name, startDate: s.academicYears.startDate, endDate: s.academicYears.endDate }).from(s.academicYears).where(eq(s.academicYears.schoolId, actor.schoolId)).orderBy(desc(s.academicYears.startDate));
  const selected = years.find(y => y.id === (requestedYear ?? context.academicYear?.id));
  if (requestedYear && !selected) throw new NotFoundError();
  if (!selected) return { ...context, years: years.map(({ id, name }) => ({ id, name })), selectedYear: null, metrics: null, lessons: [] };
  const date = context.date, e = s.studentEnrollments, a = s.attendanceRecords;
  const eligible = and(eq(e.schoolId, actor.schoolId), eq(e.academicYearId, selected.id), lte(e.effectiveFrom, date), or(isNull(e.effectiveUntil), gte(e.effectiveUntil, date)), or(eq(e.status, 'ACTIVE'), and(eq(e.status, 'ENDED'), gte(e.effectiveUntil, date))));
  const [classes, publications, rosterCounts, [enrolled], [teachers], recordedCounts, outstanding, collected] = await Promise.all([
    db.select({ id: s.classes.id, name: s.classes.name }).from(s.classes).where(and(eq(s.classes.schoolId, actor.schoolId), eq(s.classes.academicYearId, selected.id), eq(s.classes.status, 'ACTIVE'))),
    db.select().from(s.timetablePublications).where(and(eq(s.timetablePublications.schoolId, actor.schoolId), eq(s.timetablePublications.academicYearId, selected.id), lte(s.timetablePublications.effectiveFrom, date))),
    db.select({ classId: e.classId, count: countDistinct(e.studentId) }).from(e).where(eligible).groupBy(e.classId),
    db.select({ count: countDistinct(e.studentId) }).from(e).where(eligible),
    db.select({ count: countDistinct(s.teachers.id) }).from(s.teachers).where(and(eq(s.teachers.schoolId, actor.schoolId), eq(s.teachers.status, 'ACTIVE'))),
    db.select({ publicationId: a.publicationId, lessonKey: a.lessonKey, count: countDistinct(a.studentId) }).from(a).innerJoin(e, and(eq(e.schoolId, a.schoolId), eq(e.studentId, a.studentId), eq(e.classId, a.classId), eq(e.academicYearId, a.academicYearId))).where(and(eq(a.schoolId, actor.schoolId), eq(a.academicYearId, selected.id), eq(a.attendanceDate, date), eligible)).groupBy(a.publicationId, a.lessonKey),
    outstandingReport(db, actor, { academicYearId: selected.id }, now),
    collectionsReport(db, actor, { from: `${date.slice(0, 7)}-01`, to: date }, now),
  ]);
  const currentYearDay = selected.startDate <= date && date <= selected.endDate;
  const closed = (await schoolHolidaysOnDate(db, actor.schoolId, date)).length > 0;
  const applicable = currentYearDay && !closed ? applicablePublications(publications, date) : [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const lessons: AdminLesson[] = applicable.flatMap(p => p.snapshot.lessons.filter(l => l.weekday === weekday).map(l => {
    const expected = rosterCounts.find(c => c.classId === p.classId)?.count ?? 0;
    const recorded = recordedCounts.find(c => c.publicationId === p.id && c.lessonKey === l.lessonKey)?.count ?? 0;
    const status = lessonStatus(date, l.start, l.end, context.timezone, now);
    const recording = recordingStatus(status, expected, recorded);
    return { publicationId: p.id, lessonKey: l.lessonKey, classId: p.classId, className: p.snapshot.className, subjectName: l.subjectName, teacherName: l.teacherName, start: l.start, end: l.end, status, expected, recorded, recording: recording === 'pending' && !classes.some(c => c.id === p.classId) ? 'unavailable' as const : recording };
  })).sort((a, b) => a.start.localeCompare(b.start) || a.className.localeCompare(b.className));
  return { ...context, years: years.map(({ id, name }) => ({ id, name })), selectedYear: { id: selected.id, name: selected.name }, lessons,
    metrics: { enrolled: enrolled.count, classes: classes.length, teachers: teachers.count, pending: lessons.filter(l => l.recording === 'pending').length, recorded: lessons.filter(l => l.recording === 'recorded').length,
      missingTimetable: currentYearDay && !closed ? classes.filter(c => !applicable.some(p => p.classId === c.id)).length : 0,
      currency: outstanding.currency, outstandingCents: outstanding.summary.outstandingCents, overdueCents: outstanding.summary.days1to30Cents + outstanding.summary.days31to60Cents + outstanding.summary.days61plusCents,
      overdueStudents: outstanding.summary.overdueStudents, collectedCents: collected.netCents } };
}
