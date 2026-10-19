import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '@school/database';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { BusinessRuleViolationError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { appendAuditEvent } from '@/lib/audit/repository';
import { configurationSchema, loadSchema, roomSchema, effectiveConfiguration } from '../domain/contracts';

export type TimetableDb = NodePgDatabase<typeof s>;
export type Tx = Parameters<Parameters<TimetableDb['transaction']>[0]>[0];
export interface Actor { schoolId: string; userId: string | null }
export async function authorize(db: TimetableDb | Tx, actor: Actor) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: 'timetable.manage', scope: { kind: 'school' } });
  const [school] = await db.select().from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (school?.status !== 'ACTIVE') throw new ForbiddenError();
}
async function lock(tx: Tx, actor: Actor) {
  await tx.select({ id: s.schools.id }).from(s.schools).where(eq(s.schools.id, actor.schoolId)).for('update');
  await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, actor.userId!)).for('share');
  await tx.select({ id: s.schoolMemberships.id }).from(s.schoolMemberships).where(and(eq(s.schoolMemberships.schoolId, actor.schoolId), eq(s.schoolMemberships.userId, actor.userId!))).for('share');
  await authorize(tx, actor);
}
export async function year(tx: Tx, actor: Actor, id: string) {
  const [value] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, actor.schoolId), eq(s.academicYears.id, id))).for('share');
  if (!value) throw new NotFoundError();
  if (!['PLANNED', 'ACTIVE'].includes(value.status)) throw new BusinessRuleViolationError('Academic year is closed.');
  return value;
}
function revision(actual: number, expected: number) { if (actual !== expected) throw new ConflictError('Configuration changed; reload before saving.'); }
export async function audit(tx: Tx, actor: Actor, resourceId: string, action: string, revision: number, metadata: Record<string, string> = {}) {
  await appendAuditEvent(tx, { scope: 'SCHOOL', schoolId: actor.schoolId, actorKind: 'USER', actorUserId: actor.userId!, resourceType: 'Timetable', resourceId, action, metadata: { revision: String(revision), ...metadata } });
}
export async function write<T>(db: TimetableDb, actor: Actor, work: (tx: Tx) => Promise<T>) {
  await authorize(db, actor);
  try { return await db.transaction(async tx => { await lock(tx, actor); return work(tx); }); }
  catch (error) {
    const unique = (e: unknown): boolean => typeof e === 'object' && e !== null && (('code' in e && e.code === '23505') || ('cause' in e && unique(e.cause)));
    if (unique(error)) throw new ConflictError('A configuration with this name or revision already exists.');
    throw error;
  }
}
export async function state(db: TimetableDb, actor: Actor, academicYearId?: string) {
  await authorize(db, actor);
  const years = await db.select().from(s.academicYears).where(eq(s.academicYears.schoolId, actor.schoolId)).orderBy(desc(s.academicYears.startDate));
  const selected = academicYearId ? years.find(y => y.id === academicYearId) : years.find(y => y.status === 'ACTIVE') ?? years[0];
  if (academicYearId && !selected) throw new NotFoundError();
  const [stages, levels, rooms] = await Promise.all([
    db.select().from(s.stages).where(eq(s.stages.schoolId, actor.schoolId)).orderBy(asc(s.stages.sequence)),
    db.select().from(s.levels).where(eq(s.levels.schoolId, actor.schoolId)).orderBy(asc(s.levels.sequence)),
    db.select().from(s.timetableRooms).where(eq(s.timetableRooms.schoolId, actor.schoolId)).orderBy(asc(s.timetableRooms.name)),
  ]);
  const id = selected?.id;
  const configurations = id ? await db.selectDistinctOn([s.timetableConfigurations.scopeKey]).from(s.timetableConfigurations).where(and(eq(s.timetableConfigurations.schoolId, actor.schoolId), eq(s.timetableConfigurations.academicYearId, id))).orderBy(s.timetableConfigurations.scopeKey, desc(s.timetableConfigurations.revision)) : [];
  const loads = id ? await db.selectDistinctOn([s.timetableLoads.classId, s.timetableLoads.subjectId]).from(s.timetableLoads).where(and(eq(s.timetableLoads.schoolId, actor.schoolId), eq(s.timetableLoads.academicYearId, id))).orderBy(s.timetableLoads.classId, s.timetableLoads.subjectId, desc(s.timetableLoads.revision)) : [];
  const classes = id ? await db.select().from(s.classes).where(and(eq(s.classes.schoolId, actor.schoolId), eq(s.classes.academicYearId, id))).orderBy(asc(s.classes.name)) : [];
  const assignments = id ? await db.select({ assignment: s.teacherAssignments, teacherName: s.teachers.lastName, teacherFirstName: s.teachers.firstName, teacherStatus: s.teachers.status }).from(s.teacherAssignments).innerJoin(s.teachers, and(eq(s.teachers.schoolId, s.teacherAssignments.schoolId), eq(s.teachers.id, s.teacherAssignments.teacherId))).where(and(eq(s.teacherAssignments.schoolId, actor.schoolId), eq(s.teacherAssignments.academicYearId, id))) : [];
  const subjects = await db.select().from(s.subjects).where(eq(s.subjects.schoolId, actor.schoolId));
  const curriculumSubjects = await db.select().from(s.curriculumSubjects).where(eq(s.curriculumSubjects.schoolId, actor.schoolId));
  const periods = id ? await db.select().from(s.academicPeriods).where(and(eq(s.academicPeriods.schoolId, actor.schoolId), eq(s.academicPeriods.academicYearId, id))).orderBy(asc(s.academicPeriods.sequence)) : [];
  return { years, selectedYearId: id ?? null, stages, levels, rooms, configurations, loads, classes, assignments, subjects, curriculumSubjects, periods,
    effective: classes.map(c => ({ classId: c.id, configurationId: effectiveConfiguration(configurations, levels.find(l => l.id === c.levelId)?.stageId ?? '', c.levelId)?.id ?? null })) };
}
export async function saveConfiguration(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = configurationSchema.parse(raw);
  return write(db, actor, async tx => {
    await year(tx, actor, input.academicYearId);
    if (input.stageId && !(await tx.select().from(s.stages).where(and(eq(s.stages.schoolId, actor.schoolId), eq(s.stages.id, input.stageId), eq(s.stages.status, 'ACTIVE'))).for('share')).length) throw new NotFoundError();
    if (input.levelId && !(await tx.select().from(s.levels).where(and(eq(s.levels.schoolId, actor.schoolId), eq(s.levels.id, input.levelId), eq(s.levels.status, 'ACTIVE'))).for('share')).length) throw new NotFoundError();
    const scopeKey = input.levelId ? `level:${input.levelId}` : input.stageId ? `stage:${input.stageId}` : 'school';
    const [current] = await tx.select().from(s.timetableConfigurations).where(and(eq(s.timetableConfigurations.schoolId, actor.schoolId), eq(s.timetableConfigurations.academicYearId, input.academicYearId), eq(s.timetableConfigurations.scopeKey, scopeKey))).orderBy(desc(s.timetableConfigurations.revision)).limit(1);
    const days = [...input.days].sort((a, b) => a.day - b.day);
    // jsonb normalizes object-key order; compare semantic intervals rather than JSON object encoding.
    const signature = (rows: s.TimetableDay[]) => JSON.stringify(rows.map(d => [d.day, d.slots.map(slot => [slot.kind, slot.start, slot.end])]));
    if (current && current.enabled === input.enabled && signature(current.days) === signature(days)) return current;
    revision(current?.revision ?? 0, input.expectedRevision);
    const [saved] = await tx.insert(s.timetableConfigurations).values({ schoolId: actor.schoolId, academicYearId: input.academicYearId, stageId: input.stageId, levelId: input.levelId, scopeKey, days, enabled: input.enabled, revision: (current?.revision ?? 0) + 1, createdBy: actor.userId! }).returning();
    await audit(tx, actor, saved.id, 'TimetableConfigurationSaved', saved.revision); return saved;
  });
}
export async function saveRoom(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = roomSchema.parse(raw);
  return write(db, actor, async tx => {
    const [old] = input.id ? await tx.select().from(s.timetableRooms).where(and(eq(s.timetableRooms.schoolId, actor.schoolId), eq(s.timetableRooms.id, input.id))).for('update') : [];
    if (input.id && !old) throw new NotFoundError();
    if (old && old.name === input.name && old.kind === input.kind && old.active === input.active) return old;
    revision(old?.revision ?? 0, input.expectedRevision);
    const value = { name: input.name, kind: input.kind, active: input.active, revision: (old?.revision ?? 0) + 1, updatedBy: actor.userId!, updatedAt: new Date() };
    const [saved] = old ? await tx.update(s.timetableRooms).set(value).where(eq(s.timetableRooms.id, old.id)).returning() : await tx.insert(s.timetableRooms).values({ ...value, schoolId: actor.schoolId, createdBy: actor.userId! }).returning();
    await audit(tx, actor, saved.id, 'TimetableRoomSaved', saved.revision, { previousName: old?.name ?? '', name: saved.name, previousKind: old?.kind ?? '', kind: saved.kind, previousActive: old ? String(old.active) : '', active: String(saved.active) }); return saved;
  });
}
export async function saveLoad(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = loadSchema.parse(raw);
  return write(db, actor, async tx => {
    const academicYear = await year(tx, actor, input.academicYearId);
    const [classRow] = await tx.select().from(s.classes).where(and(eq(s.classes.schoolId, actor.schoolId), eq(s.classes.academicYearId, input.academicYearId), eq(s.classes.id, input.classId))).for('share');
    if (!classRow) throw new NotFoundError();
    const [current] = await tx.select().from(s.timetableLoads).where(and(eq(s.timetableLoads.schoolId, actor.schoolId), eq(s.timetableLoads.classId, input.classId), eq(s.timetableLoads.subjectId, input.subjectId))).orderBy(desc(s.timetableLoads.revision)).limit(1);
    // Retiring a historical requirement must remain possible after an assignment ends.
    if (input.enabled) {
      if (classRow.status !== 'ACTIVE') throw new BusinessRuleViolationError('Class is closed.');
      const [subject] = await tx.select().from(s.subjects).where(and(eq(s.subjects.schoolId, actor.schoolId), eq(s.subjects.id, input.subjectId), eq(s.subjects.status, 'ACTIVE'))).for('share');
      const [curriculum] = await tx.select().from(s.curriculumSubjects).where(and(eq(s.curriculumSubjects.schoolId, actor.schoolId), eq(s.curriculumSubjects.curriculumVersionId, classRow.curriculumVersionId), eq(s.curriculumSubjects.subjectId, input.subjectId), eq(s.curriculumSubjects.status, 'ACTIVE'))).for('share');
      const [assignment] = await tx.select().from(s.teacherAssignments).where(and(eq(s.teacherAssignments.schoolId, actor.schoolId), eq(s.teacherAssignments.id, input.teacherAssignmentId), eq(s.teacherAssignments.classId, input.classId), eq(s.teacherAssignments.subjectId, input.subjectId), eq(s.teacherAssignments.academicYearId, input.academicYearId), eq(s.teacherAssignments.status, 'ACTIVE'))).for('share');
      if (!subject || !curriculum || !assignment || assignment.effectiveFrom > academicYear.endDate || (assignment.effectiveUntil && assignment.effectiveUntil < academicYear.startDate)) throw new BusinessRuleViolationError('An active curriculum subject and matching Teacher Assignment in this academic year are required.');
      if (!(await tx.select().from(s.teachers).where(and(eq(s.teachers.schoolId, actor.schoolId), eq(s.teachers.id, assignment.teacherId), eq(s.teachers.status, 'ACTIVE'))).for('share')).length) throw new BusinessRuleViolationError('Teacher is inactive.');
      if (input.roomId && !(await tx.select().from(s.timetableRooms).where(and(eq(s.timetableRooms.schoolId, actor.schoolId), eq(s.timetableRooms.id, input.roomId), eq(s.timetableRooms.active, true))).for('share')).length) throw new NotFoundError();
    } else if (!current || ['teacherAssignmentId', 'roomId', 'lessonsPerWeek', 'durationMinutes'].some(key => current[key as keyof typeof current] !== input[key as keyof typeof input])) throw new BusinessRuleViolationError('Retire the existing requirement without changing its content.');
    const { expectedRevision, ...values } = input;
    const curriculumVersionId = !input.enabled && current ? current.curriculumVersionId : classRow.curriculumVersionId;
    if (current && current.curriculumVersionId === curriculumVersionId && Object.entries(values).every(([key, value]) => current[key as keyof typeof current] === value)) return current;
    revision(current?.revision ?? 0, expectedRevision);
    const [saved] = await tx.insert(s.timetableLoads).values({ ...values, schoolId: actor.schoolId, curriculumVersionId, revision: (current?.revision ?? 0) + 1, createdBy: actor.userId! }).returning();
    await audit(tx, actor, saved.id, 'TimetableLoadSaved', saved.revision); return saved;
  });
}
