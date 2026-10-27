import 'server-only';
import { and, asc, countDistinct, eq, exists, gte, inArray, isNull, lte, ne, notExists, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '@school/database';
import { schoolWallTimeToInstant } from '@school/shared';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';
import { schoolToday } from '@/lib/modules/finance/domain/contracts';
import { listSessions } from '@/lib/modules/attendance/application/session-service';
import type { TeacherLesson, TeacherWorkspaceData } from '@/lib/frontend/dashboard/teacher-workspace-types';

type Db = NodePgDatabase<typeof s>;
type Actor = { schoolId: string; userId: string };
export function teacherLessonStatus(date: string, start: string, end: string, timezone: string, now: Date): TeacherLesson['status'] {
  try {
    const from = Date.parse(schoolWallTimeToInstant(`${date}T${start}:00`, timezone));
    const until = Date.parse(schoolWallTimeToInstant(`${date}T${end}:00`, timezone));
    return now.getTime() < from ? 'upcoming' : now.getTime() < until ? 'ongoing' : 'completed';
  } catch { return 'unavailable'; }
}

/** Mirrors homework manage-all-targets, due-date enrollment and upload-readiness rules in bulk. */
export async function teacherReviewCount(db: Db, actor: Actor): Promise<number> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'homework.manage', scope: { kind: 'school' } });
  const h = s.homework, sub = s.homeworkSubmissions, target = s.homeworkTargets, e = s.studentEnrollments;
  const assignments = s.teacherAssignments, teacher = s.teachers;
  const assigned = db.select({ id: assignments.id }).from(assignments).innerJoin(teacher, and(eq(teacher.schoolId, assignments.schoolId), eq(teacher.id, assignments.teacherId)))
    .where(and(eq(assignments.schoolId, actor.schoolId), eq(teacher.userId, actor.userId), eq(teacher.status, 'ACTIVE'), eq(assignments.status, 'ACTIVE'), eq(assignments.classId, target.classId), eq(assignments.academicYearId, h.academicYearId), eq(assignments.subjectId, h.subjectId)));
  const unauthorizedTarget = db.select({ id: target.id }).from(target).where(and(eq(target.schoolId, actor.schoolId), eq(target.homeworkId, h.id), notExists(assigned)));
  const eligibleStudent = db.select({ id: e.id }).from(e).innerJoin(target, and(eq(target.schoolId, e.schoolId), eq(target.classId, e.classId), eq(target.academicYearId, e.academicYearId)))
    .where(and(eq(e.schoolId, actor.schoolId), eq(target.homeworkId, h.id), eq(e.studentId, sub.studentId), lte(e.effectiveFrom, h.dueDate), or(isNull(e.effectiveUntil), gte(e.effectiveUntil, h.dueDate))));
  const uploading = db.select({ id: s.files.id }).from(s.homeworkSubmissionAttachments).innerJoin(s.files, eq(s.files.id, s.homeworkSubmissionAttachments.fileId))
    .where(and(eq(s.homeworkSubmissionAttachments.schoolId, actor.schoolId), eq(s.homeworkSubmissionAttachments.submissionId, sub.id), eq(s.files.state, 'UPLOADING')));
  const [result] = await db.select({ count: countDistinct(sub.id) }).from(sub).innerJoin(h, and(eq(h.schoolId, sub.schoolId), eq(h.id, sub.homeworkId)))
    .where(and(eq(sub.schoolId, actor.schoolId), inArray(sub.status, ['SUBMITTED', 'LATE']), ne(h.status, 'ARCHIVED'), exists(eligibleStudent), notExists(unauthorizedTarget), notExists(uploading)));
  return result.count;
}

export async function teacherWorkspace(db: Db, actor: Actor, now = new Date()): Promise<TeacherWorkspaceData> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'attendance.read', scope: { kind: 'school' } });
  const [school] = await db.select({ timezone: s.schools.timezone, status: s.schools.status }).from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (!school || school.status !== 'ACTIVE') throw new ForbiddenError();
  const date = schoolToday(school.timezone, now);
  const [schedule, homeworkReview] = await Promise.all([listSessions(db, actor, { date }, now), teacherReviewCount(db, actor)]);
  const e = s.studentEnrollments, a = s.attendanceRecords;
  const eligible = and(eq(e.schoolId, actor.schoolId), lte(e.effectiveFrom, date), or(isNull(e.effectiveUntil), gte(e.effectiveUntil, date)), or(eq(e.status, 'ACTIVE'), and(eq(e.status, 'ENDED'), gte(e.effectiveUntil, date))));
  const classes = [...new Set(schedule.sessions.map(l => l.classId))];
  const [rosters, records] = !classes.length ? [[], []] : await Promise.all([
    db.select({ classId: e.classId, count: countDistinct(e.studentId) }).from(e).innerJoin(s.students, and(eq(s.students.schoolId, e.schoolId), eq(s.students.id, e.studentId))).where(and(eligible, inArray(e.classId, classes))).groupBy(e.classId),
    db.select({ publicationId: a.publicationId, lessonKey: a.lessonKey, count: countDistinct(a.studentId) }).from(a).innerJoin(e, and(eq(e.schoolId, a.schoolId), eq(e.studentId, a.studentId), eq(e.classId, a.classId), eq(e.academicYearId, a.academicYearId)))
      .where(and(eligible, eq(a.schoolId, actor.schoolId), eq(a.attendanceDate, date), or(...schedule.sessions.map(l => and(eq(a.publicationId, l.publicationId), eq(a.lessonKey, l.lessonKey)))))).groupBy(a.publicationId, a.lessonKey).orderBy(asc(a.lessonKey)),
  ]);
  const rosterByClass = new Map(rosters.map(r => [r.classId, r.count]));
  const recordsBySession = new Map(records.map(r => [`${r.publicationId}:${r.lessonKey}`, r.count]));
  const lessons: TeacherLesson[] = schedule.sessions.map(l => ({ publicationId: l.publicationId, lessonKey: l.lessonKey, academicYearId: l.academicYearId, classId: l.classId, className: l.className, subjectName: l.subjectName, start: l.start, end: l.end, roomId: l.roomId, roomName: l.roomName,
    status: teacherLessonStatus(date, l.start, l.end, school.timezone, now), writable: l.writable, expected: rosterByClass.get(l.classId) ?? 0, recorded: recordsBySession.get(`${l.publicationId}:${l.lessonKey}`) ?? 0 }));
  return { date, timezone: school.timezone, asOf: now.toISOString(), lessons, homeworkReview, pendingAttendance: lessons.filter(l => l.writable && l.status !== 'upcoming' && l.status !== 'unavailable' && l.expected > l.recorded).length };
}
