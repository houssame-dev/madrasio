// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { applicationSecurityAuditSql } from '@school/database/security';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { state, saveConfiguration, saveLoad, saveRoom, type TimetableDb } from '@/lib/modules/timetable/application/service';
let test: GradesTestDb, db: TimetableDb;
let school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { schoolId: string; userId: string }, assignmentId: string, levelId: string, stageId: string;
const days = [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'BREAK', start: '09:00', end: '09:15' }] }];
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as TimetableDb;
  school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  actor = { schoolId: school.schoolId, userId: actors.schoolAdminUserId }; assignmentId = randomUUID();
  await test.seed.insert(s.teacherAssignments).values({ id: assignmentId, schoolId: school.schoolId, teacherId: actors.teacherId, classId: school.classId, subjectId: school.subjectMathId, academicYearId: school.yearId, effectiveFrom: '2025-09-01' });
  levelId = (await test.seed.select().from(s.classes))[0].levelId; stageId = (await test.seed.select().from(s.levels))[0].stageId;
}, 30000);
afterEach(async () => { await test?.client.close(); });
function config(extra = {}) { return { academicYearId: school.yearId, expectedRevision: 0, days, ...extra }; }
function load(extra = {}) { return { academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, teacherAssignmentId: assignmentId, roomId: null, lessonsPerWeek: 3, durationMinutes: 60, expectedRevision: 0, enabled: true, ...extra }; }
it('replays 0027 with private RLS tables and guarded assignment context', async () => {
  expect((await test.client.query('select * from drizzle.__drizzle_migrations')).rows).toHaveLength(30);
  await test.client.exec('create role anon; create role authenticated; create role service_role');
  expect((await test.client.query(applicationSecurityAuditSql)).rows).toEqual([]);
  const first = await saveLoad(db, actor, load());
  await expect(test.seed.insert(s.timetableLoads).values({ ...first, id: randomUUID(), revision: 2, subjectId: school.subjectPhysicsId })).rejects.toThrow();
});
it('retains revisions, applies precedence, inherits again and safely repeats identical saves', async () => {
  const original = await saveConfiguration(db, actor, config());
  expect(await saveConfiguration(db, actor, config())).toEqual(original);
  await saveConfiguration(db, actor, config({ stageId }));
  const override = await saveConfiguration(db, actor, config({ levelId, days: [{ day: 6, slots: [{ kind: 'LESSON', start: '10:00', end: '11:00' }] }] }));
  expect((await state(db, actor, school.yearId)).effective[0].configurationId).toBe(override.id);
  await saveConfiguration(db, actor, config({ levelId, enabled: false, expectedRevision: 1 }));
  const current = await state(db, actor, school.yearId);
  expect(current.configurations.find(c => c.id === current.effective[0].configurationId)?.scopeKey).toBe(`stage:${stageId}`);
  await expect(saveConfiguration(db, actor, config({ days: [{ day: 2, slots: days[0].slots }] }))).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await test.seed.select().from(s.timetableConfigurations)).find(c => c.id === original.id)).toEqual(original);
  expect(await test.seed.select().from(s.auditEvents)).toHaveLength(4);
});
it('keeps exact load revisions and room preferences without creating teacher scope', async () => {
  const room = await saveRoom(db, actor, { name: 'Science lab', kind: 'LAB', active: true, expectedRevision: 0 });
  const first = await saveLoad(db, actor, load({ roomId: room.id }));
  expect(await saveLoad(db, actor, load({ roomId: room.id }))).toEqual(first);
  const next = await saveLoad(db, actor, load({ roomId: room.id, lessonsPerWeek: 4, expectedRevision: 1 }));
  expect(next).toMatchObject({ revision: 2, curriculumVersionId: school.curriculumVersionId });
  expect((await test.seed.select().from(s.timetableLoads))[0]).toEqual(first);
  expect(await test.seed.select().from(s.teacherAssignments)).toHaveLength(1);
  await test.seed.update(s.teacherAssignments).set({ status: 'ENDED' }).where(eq(s.teacherAssignments.id, assignmentId));
  await saveLoad(db, actor, load({ roomId: room.id, lessonsPerWeek: 4, expectedRevision: 2, enabled: false }));
  expect((await state(db, actor)).loads[0]).toMatchObject({ enabled: false, revision: 3 });
});
it('rejects inactive or mismatched assignments, curriculum subjects and inactive rooms', async () => {
  await expect(saveLoad(db, actor, load({ subjectId: school.subjectPhysicsId }))).rejects.toThrow();
  await test.seed.update(s.curriculumSubjects).set({ status: 'INACTIVE' }).where(eq(s.curriculumSubjects.subjectId, school.subjectMathId));
  await expect(saveLoad(db, actor, load())).rejects.toThrow();
  await test.seed.update(s.curriculumSubjects).set({ status: 'ACTIVE' }).where(eq(s.curriculumSubjects.subjectId, school.subjectMathId));
  const room = await saveRoom(db, actor, { name: 'Closed room', kind: 'ROOM', active: false, expectedRevision: 0 });
  await expect(saveLoad(db, actor, load({ roomId: room.id }))).rejects.toThrow();
  await test.seed.update(s.teacherAssignments).set({ effectiveFrom: '2027-01-01' }).where(eq(s.teacherAssignments.id, assignmentId));
  await expect(saveLoad(db, actor, load())).rejects.toThrow();
});
it('rejects cross-school references and preserves independent school configuration', async () => {
  const other = await seedSchool(test.seed), otherActors = await seedStudentAndActors(test.seed, other.schoolId, other.yearId, other.classId);
  await expect(saveConfiguration(db, actor, config({ academicYearId: other.yearId }))).rejects.toThrow();
  await expect(saveLoad(db, actor, load({ classId: other.classId }))).rejects.toThrow();
  const room = await saveRoom(db, { userId: otherActors.schoolAdminUserId, schoolId: other.schoolId }, { name: 'Other room', kind: 'ROOM', active: true, expectedRevision: 0 });
  await expect(saveLoad(db, actor, load({ roomId: room.id }))).rejects.toThrow();
  await expect(state(db, { ...actor, schoolId: other.schoolId })).rejects.toThrow();
  expect((await state(db, actor)).rooms).toEqual([]);
});
it('denies teachers, parents, platform-only, inactive users and closed years', async () => {
  const parent = await seedParentActor(test.seed, school.schoolId);
  for (const userId of [actors.teacherUserId, parent.parentUserId, null]) await expect(state(db, { schoolId: actor.schoolId, userId })).rejects.toThrow();
  await test.seed.update(s.schoolMemberships).set({ role: 'SUPER_ADMIN' }).where(eq(s.schoolMemberships.userId, actor.userId));
  await expect(saveConfiguration(db, actor, config())).rejects.toThrow();
  await test.seed.update(s.schoolMemberships).set({ role: 'SCHOOL_ADMIN' }).where(eq(s.schoolMemberships.userId, actor.userId));
  await test.seed.update(s.academicYears).set({ status: 'CLOSED' }).where(eq(s.academicYears.id, school.yearId));
  await expect(saveConfiguration(db, actor, config())).rejects.toThrow(); await expect(saveLoad(db, actor, load())).rejects.toThrow();
  await test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, actor.userId));
  await expect(saveRoom(db, actor, { name: 'Denied', kind: 'ROOM', active: true, expectedRevision: 0 })).rejects.toThrow();
});
it('rejects stale room revisions and duplicate names without deleting history', async () => {
  const room = await saveRoom(db, actor, { name: 'Room 1', kind: 'ROOM', active: true, expectedRevision: 0 });
  await saveRoom(db, actor, { id: room.id, name: 'Room 2', kind: 'ROOM', active: false, expectedRevision: 1 });
  await expect(saveRoom(db, actor, { id: room.id, name: 'Room 3', kind: 'ROOM', active: true, expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(saveRoom(db, actor, { name: 'Room 2', kind: 'LAB', active: true, expectedRevision: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await state(db, actor)).rooms).toHaveLength(1);
  expect((await test.seed.select().from(s.auditEvents)).at(-1)?.metadata).toMatchObject({ previousName: 'Room 1', name: 'Room 2', previousActive: 'true', active: 'false' });
});
it('accepts only one differing save against the same revision and leaves the winner intact', async () => {
  const results = await Promise.allSettled([
    saveConfiguration(db, actor, config()),
    saveConfiguration(db, actor, config({ days: [{ day: 2, slots: days[0].slots }] })),
  ]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  const failed = results.find(r => r.status === 'rejected');
  expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ code: 'CONFLICT' });
  expect(await test.seed.select().from(s.timetableConfigurations)).toHaveLength(1);
});
