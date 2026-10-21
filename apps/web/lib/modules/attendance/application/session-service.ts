import 'server-only';
import { and, asc, eq, isNull, lte, gte, or } from 'drizzle-orm';
import * as s from '@school/database';
import { schoolWallTimeToInstant } from '@school/shared';
import { requireOperation, resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { appendAuditEvent } from '@/lib/audit/repository';
import { applicablePublications } from '@/lib/modules/timetable/domain/publication';
import { sessionAttendanceSchema, sessionIdentitySchema, sessionQuerySchema, type SessionIdentity } from '../domain/contracts';
import type { AttendanceDb } from '../infrastructure/repositories/attendance-repository';
import type { AttendanceActor } from './attendance-service';
import { AttendanceDomainError } from './attendance-errors';

async function authority(db: AttendanceDb, actor: AttendanceActor, write: boolean) {
  const auth = db as unknown as AuthorizationDb;
  await requireOperation(auth, actor, { permission: write ? 'attendance.manage' : 'attendance.read', scope: { kind: 'school' } });
  const role = (await resolveCurrentContext(auth, actor)).role;
  if (write ? role !== 'TEACHER' : !['TEACHER', 'SCHOOL_ADMIN'].includes(role ?? '')) throw new ForbiddenError();
  return role;
}

/** Only an actual occurrence of an applicable immutable publication is a session. */
export async function listSessions(db: AttendanceDb, actor: AttendanceActor, raw: unknown, now = new Date()) {
  const { date } = sessionQuerySchema.parse(raw);
  const role = await authority(db, actor, false);
  const [school] = await db.select().from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (school?.status !== 'ACTIVE') throw new ForbiddenError();
  const publications = await db.select().from(s.timetablePublications).where(eq(s.timetablePublications.schoolId, actor.schoolId));
  const classes = await db.select({ id: s.classes.id, status: s.classes.status }).from(s.classes).where(eq(s.classes.schoolId, actor.schoolId));
  const scope = role === 'TEACHER' ? await db.select({ assignment: s.teacherAssignments, teacher: s.teachers }).from(s.teacherAssignments)
    .innerJoin(s.teachers, and(eq(s.teachers.schoolId, s.teacherAssignments.schoolId), eq(s.teachers.id, s.teacherAssignments.teacherId)))
    .where(and(eq(s.teacherAssignments.schoolId, actor.schoolId), eq(s.teachers.userId, actor.userId!), eq(s.teachers.status, 'ACTIVE'), eq(s.teacherAssignments.status, 'ACTIVE'))) : [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const sessions = applicablePublications(publications, date).flatMap(p => p.snapshot.lessons.filter(l => l.weekday === weekday &&
    (role !== 'TEACHER' || scope.some(({ assignment: a, teacher }) => teacher.id === l.teacherId && a.id === l.teacherAssignmentId && a.classId === p.classId && a.subjectId === l.subjectId && a.academicYearId === p.academicYearId && a.effectiveFrom <= date && (!a.effectiveUntil || a.effectiveUntil >= date))))
    .map(lesson => {
      let started = false;
      try { started = Date.parse(schoolWallTimeToInstant(`${date}T${lesson.start}:00`, school.timezone)) <= now.getTime(); } catch { /* Ambiguous/invalid local times fail closed. */ }
      const classStatus = classes.find(c => c.id === p.classId)?.status ?? 'ARCHIVED';
      return { publicationId: p.id, date, classId: p.classId, classStatus, academicYearId: p.academicYearId, className: p.snapshot.className, ...lesson, writable: role === 'TEACHER' && started && classStatus === 'ACTIVE' };
    }));
  return { date, sessions: sessions.sort((a, b) => a.start.localeCompare(b.start) || a.className.localeCompare(b.className)) };
}

async function session(db: AttendanceDb, actor: AttendanceActor, input: SessionIdentity, write: boolean, now: Date) {
  await authority(db, actor, write);
  const value = (await listSessions(db, actor, { date: input.date }, now)).sessions.find(row => row.publicationId === input.publicationId && row.lessonKey === input.lessonKey);
  if (!value) throw new NotFoundError();
  if (write && !value.writable) throw new AttendanceDomainError('ATTENDANCE_ENTRY_NOT_ALLOWED', 'The scheduled session has not started or is not writable.');
  return value;
}
function recordScope(actor: AttendanceActor, input: SessionIdentity) {
  return and(eq(s.attendanceRecords.schoolId, actor.schoolId), eq(s.attendanceRecords.publicationId, input.publicationId), eq(s.attendanceRecords.lessonKey, input.lessonKey), eq(s.attendanceRecords.attendanceDate, input.date));
}
function enrollment(actor: AttendanceActor, input: SessionIdentity, context: { classId: string; academicYearId: string }) {
  const e = s.studentEnrollments;
  return and(eq(e.schoolId, actor.schoolId), eq(e.classId, context.classId), eq(e.academicYearId, context.academicYearId), lte(e.effectiveFrom, input.date), or(isNull(e.effectiveUntil), gte(e.effectiveUntil, input.date)), or(eq(e.status, 'ACTIVE'), and(eq(e.status, 'ENDED'), gte(e.effectiveUntil, input.date))));
}

export async function getSessionRoster(db: AttendanceDb, actor: AttendanceActor, raw: unknown, page = 1, now = new Date()) {
  const input = sessionIdentitySchema.parse(raw);
  return db.transaction(async tx => {
    const db = tx as unknown as AttendanceDb;
    const context = await session(db, actor, input, false, now);
    const eligible = await db.selectDistinct({ id: s.students.id, firstName: s.students.firstName, lastName: s.students.lastName, studentCode: s.students.studentCode, status: s.students.status }).from(s.students)
      .innerJoin(s.studentEnrollments, and(eq(s.studentEnrollments.schoolId, s.students.schoolId), eq(s.studentEnrollments.studentId, s.students.id)))
      .where(and(eq(s.students.schoolId, actor.schoolId), enrollment(actor, input, context))).orderBy(asc(s.students.lastName), asc(s.students.firstName), asc(s.students.id));
    const records = await db.select().from(s.attendanceRecords).where(recordScope(actor, input));
    return { data: { class: { id: context.classId, name: context.className, status: context.classStatus }, attendanceDate: input.date, session: context,
      students: eligible.slice((page - 1) * 100, page * 100).map(student => ({ student, attendance: records.find(r => r.studentId === student.id) ?? null })) }, meta: { page, pageSize: 100, total: eligible.length } };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function putSessionAttendance(db: AttendanceDb, actor: AttendanceActor, raw: unknown, body: unknown, now = new Date()) {
  const input = sessionIdentitySchema.parse(raw), batch = sessionAttendanceSchema.parse(body);
  await authority(db, actor, true);
  return db.transaction(async tx => {
    // Same first lock as publication. No replacement may invalidate the session mid-write.
    await tx.select({ id: s.schools.id }).from(s.schools).where(eq(s.schools.id, actor.schoolId)).for('update');
    await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, actor.userId!)).for('share');
    await tx.select({ id: s.schoolMemberships.id }).from(s.schoolMemberships).where(and(eq(s.schoolMemberships.schoolId, actor.schoolId), eq(s.schoolMemberships.userId, actor.userId!))).for('share');
    const db = tx as unknown as AttendanceDb;
    const context = await session(db, actor, input, true, now);
    const [klass] = await tx.select().from(s.classes).where(and(eq(s.classes.schoolId, actor.schoolId), eq(s.classes.id, context.classId))).for('share');
    const [year] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, actor.schoolId), eq(s.academicYears.id, context.academicYearId))).for('share');
    // Lock the precise lifecycle authority before re-evaluating it inside the transaction.
    await tx.select({ id: s.teacherAssignments.id }).from(s.teacherAssignments).where(and(eq(s.teacherAssignments.schoolId, actor.schoolId), eq(s.teacherAssignments.id, context.teacherAssignmentId))).for('share');
    await tx.select({ id: s.teachers.id }).from(s.teachers).where(and(eq(s.teachers.schoolId, actor.schoolId), eq(s.teachers.id, context.teacherId))).for('share');
    await session(db, actor, input, true, now);
    if (!klass || klass.status !== 'ACTIVE' || !year || input.date < year.startDate || input.date > year.endDate) throw new AttendanceDomainError('ATTENDANCE_ENTRY_NOT_ALLOWED', 'Academic context is not writable.');
    const saved = [];
    for (const entry of [...batch.records].sort((a, b) => a.studentId.localeCompare(b.studentId))) {
      const [student] = await tx.select({ id: s.students.id }).from(s.students).where(and(eq(s.students.schoolId, actor.schoolId), eq(s.students.id, entry.studentId))).for('share');
      const eligible = await tx.select({ id: s.studentEnrollments.id }).from(s.studentEnrollments).where(and(enrollment(actor, input, context), eq(s.studentEnrollments.studentId, entry.studentId))).for('share');
      if (!student || eligible.length !== 1) throw new AttendanceDomainError('STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE', 'Student enrollment is absent or ambiguous for this session.');
      const [existing] = await tx.select().from(s.attendanceRecords).where(and(recordScope(actor, input), eq(s.attendanceRecords.studentId, entry.studentId))).for('update');
      if (existing && existing.status === entry.status && existing.note === (entry.note ?? null)) { saved.push(existing); continue; }
      if ((existing?.version ?? null) !== entry.expectedVersion) throw new ConflictError('Attendance changed; reload before correcting it.');
      const values = { status: entry.status, note: entry.note ?? null, updatedBy: actor.userId!, updatedAt: now, version: (existing?.version ?? 0) + 1 };
      const [row] = existing ? await tx.update(s.attendanceRecords).set(values).where(eq(s.attendanceRecords.id, existing.id)).returning() : await tx.insert(s.attendanceRecords).values({ ...values, schoolId: actor.schoolId, studentId: entry.studentId, classId: context.classId, academicYearId: context.academicYearId, attendanceDate: input.date, publicationId: input.publicationId, lessonKey: input.lessonKey,
        session: { lessonKey: context.lessonKey, weekday: context.weekday, start: context.start, end: context.end, subjectId: context.subjectId, subjectName: context.subjectName, teacherAssignmentId: context.teacherAssignmentId, teacherId: context.teacherId, teacherName: context.teacherName, roomId: context.roomId, roomName: context.roomName } }).returning();
      await appendAuditEvent(tx, { scope: 'SCHOOL', schoolId: actor.schoolId, actorKind: 'USER', actorUserId: actor.userId!, resourceType: 'Attendance', resourceId: row.id, action: existing ? 'AttendanceCorrected' : 'AttendanceRecorded', metadata: { publicationId: input.publicationId, lessonKey: input.lessonKey, date: input.date, oldStatus: existing?.status ?? '', newStatus: entry.status, oldNote: existing?.note ?? '', newNote: entry.note ?? '', version: String(row.version) } });
      saved.push(row);
    }
    return { records: saved };
  });
}
