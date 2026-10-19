import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import * as s from '@school/database';
import { requireOperation, resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import { BusinessRuleViolationError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { schoolToday } from '@/lib/modules/finance/domain/contracts';
import { write, audit, authorize, type Actor, type TimetableDb } from './service';
import * as repo from '../infrastructure/builder-repository';
import { validateLessons, schedulingConflicts, type Reservation } from '../domain/builder';
import { applicablePublications, publicationRanges, publishSchema, publishedQuerySchema } from '../domain/publication';

type Db = TimetableDb | Parameters<Parameters<TimetableDb['transaction']>[0]>[0];
const events = (db: Db, schoolId: string) => db.select().from(s.timetablePublications).where(eq(s.timetablePublications.schoolId, schoolId)).orderBy(desc(s.timetablePublications.sequence));
export async function publishDraft(db: TimetableDb, actor: Actor, raw: unknown, now = new Date()) {
  const input = publishSchema.parse(raw);
  return write(db, actor, async tx => {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior = await tx.select().from(s.timetablePublications).where(and(eq(s.timetablePublications.schoolId, actor.schoolId), eq(s.timetablePublications.requestKey, input.requestKey)));
    if (prior[0]) { if (prior[0].requestHash !== hash) throw new ConflictError('Publication request key changed.'); return { id: prior[0].id, sequence: prior[0].sequence }; }
    const c = await repo.context(tx, actor.schoolId, input, true), draft = await repo.latest(tx, actor.schoolId, input);
    if (!c.year || !c.period || !c.classRow || !draft) throw new NotFoundError();
    if (!['PLANNED', 'ACTIVE'].includes(c.year.status) || c.period.status === 'CLOSED' || c.classRow.status !== 'ACTIVE') throw new BusinessRuleViolationError('Academic context is closed.');
    if (c.period.startDate < c.year.startDate || c.period.endDate > c.year.endDate) throw new BusinessRuleViolationError('Academic Period is outside its Year.');
    if (draft.id !== input.draftId || draft.revision !== input.expectedRevision) throw new ConflictError('Draft changed; reload before publishing.');
    if (draft.startDate !== c.period.startDate || draft.endDate !== c.period.endDate || draft.curriculumVersionId !== c.classRow.curriculumVersionId) throw new ConflictError('Review and save the changed academic context first.');
    const [school] = await tx.select().from(s.schools).where(eq(s.schools.id, actor.schoolId));
    const today = schoolToday(school.timezone, now);
    const all = await events(tx, actor.schoolId), own = all.filter(p => p.classId === input.classId), latest = own[0];
    if ((latest?.sequence ?? 0) !== input.expectedSequence) throw new ConflictError('Publication changed; reload before publishing.');
    if (input.effectiveFrom < today || input.effectiveFrom < c.period.startDate || input.effectiveFrom > c.period.endDate || (latest && input.effectiveFrom <= latest.effectiveFrom)) throw new BusinessRuleViolationError('Choose a non-past date within the Period and after the latest publication date.');
    const configuration = await repo.configuration(tx, actor.schoolId, input.academicYearId, draft.configurationId), lessons = await repo.lessons(tx, actor.schoolId, draft.id);
    const issues = validateLessons(lessons, c, configuration, input.effectiveFrom, c.period.endDate);
    if ((!lessons.length && !latest) || issues.length) throw new BusinessRuleViolationError('Correct and save eligible lessons before publishing.', { issues });
    const snapshot: s.TimetablePublicationSnapshot = { className: c.classRow.name, yearName: c.year.name, periodName: c.period.name, timezone: school.timezone,
      lessons: lessons.map(l => { const assignment = c.assignments.find(a => a.id === l.teacherAssignmentId)!, teacher = c.teachers.find(t => t.id === assignment.teacherId)!;
        return { ...l, subjectName: c.subjects.find(v => v.id === l.subjectId)!.name, teacherId: teacher.id, teacherName: `${teacher.firstName} ${teacher.lastName}`, roomName: c.rooms.find(r => r.id === l.roomId)?.name ?? null }; }) };
    const candidate: Reservation[] = snapshot.lessons.map(l => ({ ...l, classId: input.classId, className: snapshot.className, periodName: snapshot.periodName, startDate: input.effectiveFrom, endDate: c.period!.endDate }));
    const existing: Reservation[] = publicationRanges(all).filter(p => p.classId !== input.classId).flatMap(p => p.snapshot.lessons.map(l => ({ ...l, classId: p.classId, className: p.snapshot.className, periodName: p.snapshot.periodName, startDate: p.effectiveFrom, endDate: p.effectiveUntil })));
    const conflicts = schedulingConflicts(candidate, existing);
    if (conflicts.length) throw new ConflictError('Resolve published timetable conflicts first.', { kind: 'SCHEDULING_CONFLICT', conflicts });
    const [saved] = await tx.insert(s.timetablePublications).values({ schoolId: actor.schoolId, academicYearId: input.academicYearId, classId: input.classId, draftId: draft.id,
      sequence: (latest?.sequence ?? 0) + 1, effectiveFrom: input.effectiveFrom, validUntil: c.period.endDate, snapshot, requestKey: input.requestKey, requestHash: hash, publishedBy: actor.userId! }).returning();
    await audit(tx, actor, saved.id, 'TimetablePublished', saved.sequence, { draftId: draft.id, effectiveFrom: input.effectiveFrom });
    return { id: saved.id, sequence: saved.sequence };
  });
}

/** Role-specific DTOs: no draft rows, internal request hashes, actor IDs or other children's data. */
export async function readPublished(db: TimetableDb, actor: Actor, raw: unknown, now = new Date()) {
  const input = publishedQuerySchema.parse(raw);
  return db.transaction(async tx => {
    const auth = tx as unknown as AuthorizationDb;
    await requireOperation(auth, actor, { permission: 'timetable.read', scope: { kind: 'school' } });
    const role = (await resolveCurrentContext(auth, actor)).role;
    const [school] = await tx.select().from(s.schools).where(eq(s.schools.id, actor.schoolId));
    if (school?.status !== 'ACTIVE') throw new ForbiddenError();
    const today = schoolToday(school.timezone, now), date = input.date ?? today;
    const all = await events(tx, actor.schoolId);
    let selected = applicablePublications(all, date);
    let children: { id: string; name: string }[] = [], teachers: { id: string; name: string }[] = [], classes: { id: string; name: string }[] = [];
    if (role === 'SCHOOL_ADMIN') {
      await authorize(tx, actor); if (input.studentId) throw new ForbiddenError();
      classes = (await tx.select().from(s.classes).where(eq(s.classes.schoolId, actor.schoolId))).map(c => ({ id: c.id, name: c.name }));
      teachers = (await tx.select().from(s.teachers).where(eq(s.teachers.schoolId, actor.schoolId))).map(t => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }));
      if (input.classId && !classes.some(c => c.id === input.classId) || input.teacherId && !teachers.some(t => t.id === input.teacherId)) throw new NotFoundError();
      selected = selected.filter(p => !input.classId || p.classId === input.classId);
    } else if (role === 'TEACHER') {
      if (input.classId || input.teacherId || input.studentId) throw new ForbiddenError();
      const assignments = await tx.select({ assignment: s.teacherAssignments }).from(s.teacherAssignments).innerJoin(s.teachers, and(eq(s.teachers.schoolId, actor.schoolId), eq(s.teachers.id, s.teacherAssignments.teacherId), eq(s.teachers.userId, actor.userId!), eq(s.teachers.status, 'ACTIVE')))
        .where(and(eq(s.teacherAssignments.schoolId, actor.schoolId), eq(s.teacherAssignments.status, 'ACTIVE')));
      selected = selected.map(p => ({ ...p, snapshot: { ...p.snapshot, lessons: p.snapshot.lessons.filter(l => assignments.some(({ assignment: a }) => a.id === l.teacherAssignmentId && a.teacherId === l.teacherId && a.classId === p.classId && a.subjectId === l.subjectId && a.academicYearId === p.academicYearId && a.effectiveFrom <= date && (!a.effectiveUntil || a.effectiveUntil >= date))) } })).filter(p => p.snapshot.lessons.length);
    } else if (role === 'PARENT') {
      if (input.classId || input.teacherId) throw new ForbiddenError();
      const linked = await tx.select({ id: s.students.id, first: s.students.firstName, last: s.students.lastName }).from(s.parentStudents)
        .innerJoin(s.parents, and(eq(s.parents.schoolId, actor.schoolId), eq(s.parents.id, s.parentStudents.parentId), eq(s.parents.userId, actor.userId!), eq(s.parents.status, 'ACTIVE')))
        .innerJoin(s.students, and(eq(s.students.schoolId, actor.schoolId), eq(s.students.id, s.parentStudents.studentId), eq(s.students.status, 'ACTIVE')))
        .where(and(eq(s.parentStudents.schoolId, actor.schoolId), eq(s.parentStudents.status, 'ACTIVE')));
      children = [...new Map(linked.map(c => [c.id, { id: c.id, name: `${c.first} ${c.last}` }])).values()];
      if (input.studentId && !children.some(c => c.id === input.studentId)) throw new NotFoundError();
      const studentId = input.studentId ?? children.at(0)?.id;
      if (!studentId) selected = [];
      else {
        const placements = (await tx.select().from(s.studentEnrollments).where(and(eq(s.studentEnrollments.schoolId, actor.schoolId), eq(s.studentEnrollments.studentId, studentId))))
          .filter(e => e.effectiveFrom <= date && (!e.effectiveUntil || e.effectiveUntil >= date) && (e.status === 'ACTIVE' || !!e.effectiveUntil));
        if (placements.length > 1) throw new ConflictError('Academic placement is ambiguous.');
        selected = selected.filter(p => placements.some(e => e.classId === p.classId && e.academicYearId === p.academicYearId));
      }
    } else throw new ForbiddenError();
    if (role === 'SCHOOL_ADMIN' && input.teacherId) selected = selected.map(p => ({ ...p, snapshot: { ...p.snapshot, lessons: p.snapshot.lessons.filter(l => l.teacherId === input.teacherId) } })).filter(p => p.snapshot.lessons.length);
    const publicRow = (p: (typeof selected)[number]) => ({ id: p.id, classId: p.classId, sequence: p.sequence, effectiveFrom: p.effectiveFrom, effectiveUntil: p.effectiveUntil, publishedAt: p.publishedAt, ...p.snapshot });
    const history = role === 'SCHOOL_ADMIN' && input.classId ? publicationRanges(all.filter(p => p.classId === input.classId)).map(publicRow) : [];
    return { date, today, role, children, classes, teachers, selectedStudentId: input.studentId ?? children.at(0)?.id ?? null, schedules: selected.map(publicRow), history,
      latestSequence: input.classId ? Math.max(0, ...all.filter(p => p.classId === input.classId).map(p => p.sequence)) : 0,
      latestEffectiveFrom: input.classId ? all.find(p => p.classId === input.classId)?.effectiveFrom ?? null : null };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
