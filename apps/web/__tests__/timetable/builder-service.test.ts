// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { saveConfiguration, saveLoad, saveRoom, type TimetableDb } from '@/lib/modules/timetable/application/service';
import { getDraft, saveDraft } from '@/lib/modules/timetable/application/builder';
import type { Lesson } from '@/lib/modules/timetable/domain/builder';
let test: GradesTestDb, db: TimetableDb, school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string }, configId: string, assignmentId: string, classB: string, assignmentB: string, levelB: string, configB: string, roomId: string;
const slots = [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'BREAK', start: '09:00', end: '09:15' }, { kind: 'LESSON', start: '09:15', end: '10:15' }];
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as TimetableDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId); actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  configId = (await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 0, days: [1, 2].map(day => ({ day, slots })) })).id;
  assignmentId = randomUUID(); await test.seed.insert(s.teacherAssignments).values({ id: assignmentId, schoolId: school.schoolId, academicYearId: school.yearId, classId: school.classId, teacherId: actors.teacherId, subjectId: school.subjectMathId, effectiveFrom: '2025-09-01' });
  const [level] = await test.seed.select().from(s.levels); levelB = randomUUID(); await test.seed.insert(s.levels).values({ id: levelB, schoolId: school.schoolId, stageId: level.stageId, name: 'Different schedule', sequence: 2 });
  classB = randomUUID(); await test.seed.insert(s.classes).values({ id: classB, schoolId: school.schoolId, academicYearId: school.yearId, levelId: levelB, curriculumVersionId: school.curriculumVersionId, name: 'Class B' });
  configB = (await saveConfiguration(db, actor, { academicYearId: school.yearId, levelId: levelB, expectedRevision: 0, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:30', end: '09:30' }] }] })).id;
  assignmentB = randomUUID(); await test.seed.insert(s.teacherAssignments).values({ id: assignmentB, schoolId: school.schoolId, academicYearId: school.yearId, classId: classB, teacherId: actors.teacherId, subjectId: school.subjectMathId, effectiveFrom: '2025-09-01' });
  roomId = (await saveRoom(db, actor, { name: 'Room 1', kind: 'ROOM', active: true, expectedRevision: 0 })).id;
}, 30000);
afterEach(async () => { await test?.client.close(); });
const context = () => ({ academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: school.classId });
const lesson = (patch: Partial<Lesson> = {}): Lesson => ({ lessonKey: randomUUID(), weekday: 1, start: '08:00', end: '09:00', subjectId: school.subjectMathId, teacherAssignmentId: assignmentId, roomId, ...patch });
const body = (lessons: Lesson[], patch = {}) => ({ ...context(), lessons, configurationId: configId, curriculumVersionId: school.curriculumVersionId, startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: 0, requestKey: randomUUID(), ...patch });
it('adds, edits, moves and removes lessons as immutable revisions, with safe replay', async () => {
  const l = lesson(), input = body([l]), first = await saveDraft(db, actor, input);
  expect(await saveDraft(db, actor, input)).toEqual(first);
  expect((await getDraft(db, actor, context())).lessons).toEqual([l]);
  const oldRows = await test.seed.select().from(s.timetableLessons);
  const second = await saveDraft(db, actor, body([{ ...l, weekday: 2 }], { expectedRevision: 1 })); expect(second.revision).toBe(2);
  await saveDraft(db, actor, body([], { expectedRevision: 2 }));
  const current = await getDraft(db, actor, context()); expect(current.lessons).toEqual([]); expect(current.draft?.revision).toBe(3);
  expect((await test.seed.select().from(s.timetableLessons)).filter(r => r.draftId === first.id)).toEqual(oldRows);
  expect((await test.seed.select().from(s.auditEvents)).filter(e => e.action === 'TimetableDraftSaved')).toHaveLength(3);
});
it('finds Teacher and Room conflicts across different Level times with actionable context', async () => {
  await saveDraft(db, actor, body([lesson()]));
  const other = body([lesson({ teacherAssignmentId: assignmentB, start: '08:30', end: '09:30' })], { classId: classB, configurationId: configB });
  await expect(saveDraft(db, actor, other)).rejects.toMatchObject({ code: 'CONFLICT', details: { kind: 'SCHEDULING_CONFLICT', conflicts: expect.arrayContaining([{ kind: 'TEACHER', lessonKey: other.lessons[0].lessonKey, otherClass: '5A', otherPeriod: 'Term 1', weekday: 1, start: '08:00', end: '09:00' }, expect.objectContaining({ kind: 'ROOM' })]) } });
  expect(await test.seed.select().from(s.timetableDrafts)).toHaveLength(1);
});
it('allows adjacent periods with the same Teacher and Room, without ghost historical reservations', async () => {
  const first = await saveDraft(db, actor, body([lesson()]));
  await saveDraft(db, actor, body([], { expectedRevision: 1 }));
  await saveDraft(db, actor, body([lesson({ teacherAssignmentId: assignmentB, start: '08:30', end: '09:30' })], { classId: classB, configurationId: configB }));
  expect((await test.seed.select().from(s.timetableLessons)).some(l => l.draftId === first.id)).toBe(true);
  await saveDraft(db, actor, body([], { classId: classB, configurationId: configB, expectedRevision: 1 }));
  await saveDraft(db, actor, body([lesson()], { expectedRevision: 2 }));
  const config = await saveConfiguration(db, actor, { academicYearId: school.yearId, levelId: levelB, expectedRevision: 1, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '09:00', end: '10:00' }] }] });
  await saveDraft(db, actor, body([lesson({ teacherAssignmentId: assignmentB, start: '09:00', end: '10:00' })], { classId: classB, configurationId: config.id, expectedRevision: 2 }));
});
it('rejects same-Class duplicates and room-only conflicts', async () => {
  await expect(saveDraft(db, actor, body([lesson(), lesson()]))).rejects.toMatchObject({ details: { conflicts: expect.arrayContaining([expect.objectContaining({ kind: 'CLASS' })]) } });
  await saveDraft(db, actor, body([lesson()]));
  const teacher = randomUUID(), assignment = randomUUID();
  await test.seed.insert(s.teachers).values({ id: teacher, schoolId: school.schoolId, firstName: 'Other', lastName: 'Teacher' });
  await test.seed.insert(s.teacherAssignments).values({ id: assignment, schoolId: school.schoolId, academicYearId: school.yearId, classId: classB, teacherId: teacher, subjectId: school.subjectMathId, effectiveFrom: '2025-09-01' });
  const l = lesson({ teacherAssignmentId: assignment, start: '08:30', end: '09:30' });
  await expect(saveDraft(db, actor, body([l], { classId: classB, configurationId: configB }))).rejects.toMatchObject({ details: { conflicts: [expect.objectContaining({ kind: 'ROOM' })] } });
  await saveDraft(db, actor, body([{ ...l, roomId: null }], { classId: classB, configurationId: configB }));
});
it('compares actual recurrence dates across different Periods, not just Period identifiers', async () => {
  await saveDraft(db, actor, body([lesson()]));
  await saveDraft(db, actor, body([lesson({ teacherAssignmentId: assignmentB, start: '08:30', end: '09:30' })], { academicPeriodId: school.period2Id, classId: classB, configurationId: configB, startDate: '2026-01-05', endDate: '2026-04-01' }));
  const overlapping = randomUUID(); await test.seed.insert(s.academicPeriods).values({ id: overlapping, schoolId: school.schoolId, academicYearId: school.yearId, name: 'Overlapping context', sequence: 3, startDate: '2025-11-01', endDate: '2025-12-01' });
  await expect(saveDraft(db, actor, body([lesson()], { academicPeriodId: overlapping, startDate: '2025-11-01', endDate: '2025-12-01' }))).rejects.toMatchObject({ details: { conflicts: expect.arrayContaining([expect.objectContaining({ kind: 'CLASS' })]) } });
});
it('requires active, matching assignments covering every occurrence, and valid slots/rooms/subjects', async () => {
  for (const l of [lesson({ teacherAssignmentId: assignmentB }), lesson({ start: '09:00', end: '09:15' }), lesson({ subjectId: school.subjectPhysicsId })]) await expect(saveDraft(db, actor, body([l]))).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  await test.seed.update(s.teacherAssignments).set({ effectiveUntil: '2025-10-01' }).where(eq(s.teacherAssignments.id, assignmentId));
  await expect(saveDraft(db, actor, body([lesson()]))).rejects.toMatchObject({ details: { issues: expect.arrayContaining([expect.objectContaining({ kind: 'ASSIGNMENT' })]) } });
  await test.seed.update(s.teacherAssignments).set({ effectiveUntil: null, status: 'ENDED' }).where(eq(s.teacherAssignments.id, assignmentId));
  await expect(saveDraft(db, actor, body([lesson()]))).rejects.toThrow();
  await test.seed.update(s.teacherAssignments).set({ status: 'ACTIVE' }).where(eq(s.teacherAssignments.id, assignmentId));
  await test.seed.update(s.teachers).set({ status: 'INACTIVE' }).where(eq(s.teachers.id, actors.teacherId)); await expect(saveDraft(db, actor, body([lesson()]))).rejects.toThrow();
  await test.seed.update(s.teachers).set({ status: 'ACTIVE' }).where(eq(s.teachers.id, actors.teacherId));
  await test.seed.update(s.timetableRooms).set({ active: false }).where(eq(s.timetableRooms.id, roomId)); await expect(saveDraft(db, actor, body([lesson()]))).rejects.toThrow();
});
it('saves incomplete loads, reports progress and does not give Teachers/Parents draft access', async () => {
  await saveLoad(db, actor, { academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, teacherAssignmentId: assignmentId, roomId: null, lessonsPerWeek: 3, durationMinutes: 60, enabled: true, expectedRevision: 0 });
  await saveDraft(db, actor, body([lesson()])); expect((await getDraft(db, actor, context())).progress[0]).toMatchObject({ status: 'INCOMPLETE', required: 3, scheduled: 1 });
  const parent = await seedParentActor(test.seed, school.schoolId);
  for (const userId of [actors.teacherUserId, parent.parentUserId, null]) {
    await expect(getDraft(db, { ...actor, userId }, context())).rejects.toThrow(); await expect(saveDraft(db, { ...actor, userId }, body([]))).rejects.toThrow();
  }
  await test.seed.update(s.schoolMemberships).set({ role: 'SUPER_ADMIN' }).where(eq(s.schoolMemberships.userId, actor.userId)); await expect(getDraft(db, actor, context())).rejects.toThrow();
});
it('rejects stale revisions, changed request bodies and stale academic contexts without overwriting', async () => {
  const input = body([lesson()]); const first = await saveDraft(db, actor, input);
  await expect(saveDraft(db, actor, body([]))).rejects.toMatchObject({ details: { kind: 'STALE_DRAFT' } });
  await expect(saveDraft(db, actor, { ...input, lessons: [] })).rejects.toMatchObject({ code: 'CONFLICT' });
  await test.seed.update(s.academicPeriods).set({ startDate: '2025-09-02' }).where(eq(s.academicPeriods.id, school.period1Id));
  await expect(saveDraft(db, actor, body([], { expectedRevision: 1 }))).rejects.toMatchObject({ details: { kind: 'CONTEXT_CHANGED' } });
  const current = await getDraft(db, actor, context()); expect(current.contextChanged).toBe(true); expect(current.draft?.id).toBe(first.id);
});
it('pins the teaching week and adopts a newer configuration only with explicit valid times', async () => {
  const l = lesson(); await saveDraft(db, actor, body([l]));
  const newer = await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 1, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '10:00', end: '11:00' }] }] });
  const current = await getDraft(db, actor, context()); expect(current.configuration?.id).toBe(configId); expect(current.configurationChanged).toBe(true);
  await expect(saveDraft(db, actor, body([l], { expectedRevision: 1, configurationId: newer.id }))).rejects.toMatchObject({ details: { issues: expect.arrayContaining([expect.objectContaining({ kind: 'SLOT' })]) } });
  await saveDraft(db, actor, body([{ ...l, start: '10:00', end: '11:00' }], { expectedRevision: 1, configurationId: newer.id }));
});
it('enforces tenant boundaries and closed academic states', async () => {
  const other = await seedSchool(test.seed);
  await expect(getDraft(db, actor, { ...context(), academicYearId: other.yearId })).rejects.toThrow();
  await expect(saveDraft(db, actor, body([], { classId: other.classId }))).rejects.toThrow();
  await expect(getDraft(db, { ...actor, schoolId: other.schoolId }, context())).rejects.toThrow();
  await test.seed.update(s.academicPeriods).set({ status: 'CLOSED' }).where(eq(s.academicPeriods.id, school.period1Id));
  expect((await getDraft(db, actor, context())).editable).toBe(false); await expect(saveDraft(db, actor, body([]))).rejects.toThrow();
});
it('serializes competing draft writes in the test transaction adapter', async () => {
  const results = await Promise.allSettled([saveDraft(db, actor, body([lesson()])), saveDraft(db, actor, body([lesson({ teacherAssignmentId: assignmentB, start: '08:30', end: '09:30' })], { classId: classB, configurationId: configB }))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await test.seed.select().from(s.timetableDrafts)).toHaveLength(1);
});
