// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors, seedParentActor, type GradesTestDb } from '../grades/test-helpers';
import { saveConfiguration, type TimetableDb } from '@/lib/modules/timetable/application/service';
import { saveDraft } from '@/lib/modules/timetable/application/builder';
import { publishDraft, readPublished } from '@/lib/modules/timetable/application/publication';
let test: GradesTestDb, db: TimetableDb, school: Awaited<ReturnType<typeof seedSchool>>, actors: Awaited<ReturnType<typeof seedStudentAndActors>>;
let actor: { userId: string; schoolId: string }, assignment: string, config: string, draft: { id: string; revision: number };
const now = new Date('2025-09-01T12:00:00Z');
beforeEach(async () => {
  test = await createGradesTestDb(); db = test.seed as unknown as TimetableDb; school = await seedSchool(test.seed); actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId); actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  assignment = randomUUID(); await test.seed.insert(s.teacherAssignments).values({ id: assignment, schoolId: school.schoolId, academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, teacherId: actors.teacherId, effectiveFrom: '2025-09-01' });
  config = (await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 0, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'LESSON', start: '09:00', end: '10:00' }] }] })).id;
  draft = await saveDraft(db, actor, draftBody());
}, 30000);
afterEach(async () => { await test?.client.close(); });
function draftBody(revision = 0, start = '08:00', end = '09:00') { return { academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: school.classId, configurationId: config, curriculumVersionId: school.curriculumVersionId, startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: revision, requestKey: randomUUID(), lessons: [{ lessonKey: randomUUID(), weekday: 1, start, end, subjectId: school.subjectMathId, teacherAssignmentId: assignment, roomId: null }] }; }
function input(sequence = 0, date = '2025-09-01') { return { academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: school.classId, draftId: draft.id, expectedRevision: draft.revision, expectedSequence: sequence, effectiveFrom: date, requestKey: randomUUID(), confirm: true }; }
it('publishes only explicit saved content, snapshots names/times, appends replacements and resolves date boundaries', async () => {
  expect((await readPublished(db, actor, {}, now)).schedules).toEqual([]);
  const body = input(), first = await publishDraft(db, actor, body, now); expect(await publishDraft(db, actor, body, now)).toEqual(first);
  const original = (await test.seed.select().from(s.timetablePublications))[0];
  await test.seed.update(s.subjects).set({ name: 'Renamed now' }).where(eq(s.subjects.id, school.subjectMathId));
  draft = await saveDraft(db, actor, draftBody(1, '09:00', '10:00'));
  expect((await readPublished(db, actor, { date: '2025-09-07' }, now)).schedules[0].lessons[0]).toMatchObject({ start: '08:00', subjectName: original.snapshot.lessons[0].subjectName });
  await publishDraft(db, actor, input(1, '2025-09-08'), now);
  const before = await readPublished(db, actor, { date: '2025-09-07', classId: school.classId }, now), after = await readPublished(db, actor, { date: '2025-09-08', classId: school.classId }, now);
  expect(before.schedules[0]).toMatchObject({ sequence: 1, effectiveUntil: '2025-09-07' }); expect(after.schedules[0]).toMatchObject({ sequence: 2, lessons: [expect.objectContaining({ start: '09:00', subjectName: 'Renamed now' })] });
  expect(after.history).toHaveLength(2); expect((await test.seed.select().from(s.timetablePublications)).find(p => p.id === original.id)).toEqual(original);
  expect((await readPublished(db, actor, { date: '2025-12-21' }, now)).schedules).toEqual([]);
  draft = await saveDraft(db, actor, { ...draftBody(2), lessons: [] });
  await publishDraft(db, actor, input(2, '2025-09-15'), now);
  expect((await readPublished(db, actor, { date: '2025-09-14' }, now)).schedules[0].sequence).toBe(2);
  expect((await readPublished(db, actor, { date: '2025-09-15' }, now)).schedules[0]).toMatchObject({ sequence: 3, lessons: [] });
});
it('rejects stale drafts, stale publication sequences, past/same dates, request key reuse and closed contexts', async () => {
  const old = input(); draft = await saveDraft(db, actor, draftBody(1)); await expect(publishDraft(db, actor, old, now)).rejects.toMatchObject({ code: 'CONFLICT' });
  const body = input(); await publishDraft(db, actor, body, now);
  await expect(publishDraft(db, actor, input(), now)).rejects.toMatchObject({ code: 'CONFLICT' });
  for (const date of ['2025-08-31', '2025-09-01', '2025-12-21']) await expect(publishDraft(db, actor, input(1, date), now)).rejects.toThrow();
  await expect(publishDraft(db, actor, { ...body, effectiveFrom: '2025-09-02' }, now)).rejects.toMatchObject({ code: 'CONFLICT' });
  await test.seed.update(s.academicPeriods).set({ status: 'CLOSED' }).where(eq(s.academicPeriods.id, school.period1Id)); await expect(publishDraft(db, actor, input(1, '2025-09-08'), now)).rejects.toThrow();
});
it('uses TeacherAssignment authority and never returns drafts, other teachers or ended assignments', async () => {
  const teacher = { ...actor, userId: actors.teacherUserId }; expect((await readPublished(db, teacher, {}, now)).schedules).toEqual([]);
  await publishDraft(db, actor, input(), now); const result = await readPublished(db, teacher, {}, now); expect(result.schedules).toHaveLength(1); expect(result.history).toEqual([]); expect(JSON.stringify(result)).not.toContain('requestHash'); expect(JSON.stringify(result)).not.toContain('draftId');
  await expect(readPublished(db, teacher, { classId: school.classId }, now)).rejects.toThrow(); await expect(publishDraft(db, teacher, input(), now)).rejects.toThrow();
  await test.seed.update(s.teacherAssignments).set({ status: 'ENDED' }).where(eq(s.teacherAssignments.id, assignment)); expect((await readPublished(db, teacher, {}, now)).schedules).toEqual([]); expect((await readPublished(db, actor, {}, now)).schedules).toHaveLength(1);
});
it('resolves only linked children and dated enrollment, denying cross-child/cross-School and ended relationships', async () => {
  const parent = await seedParentActor(test.seed, school.schoolId), a = { ...actor, userId: parent.parentUserId }, parentId = randomUUID();
  await test.seed.insert(s.parents).values({ id: parentId, schoolId: school.schoolId, userId: parent.parentUserId, firstName: 'Synthetic', lastName: 'Parent' });
  const relationship = randomUUID(); await test.seed.insert(s.parentStudents).values({ id: relationship, schoolId: school.schoolId, parentId, studentId: actors.studentId });
  await publishDraft(db, actor, input(), now); expect((await readPublished(db, a, { studentId: actors.studentId }, now)).schedules).toHaveLength(1);
  const [originalClass] = await test.seed.select().from(s.classes).where(eq(s.classes.id, school.classId));
  const otherClass = randomUUID(), otherChild = randomUUID(); await test.seed.insert(s.classes).values({ ...originalClass, id: otherClass, name: 'Other child class' });
  await test.seed.insert(s.students).values({ id: otherChild, schoolId: school.schoolId, firstName: 'Other', lastName: 'Child' });
  await test.seed.insert(s.parentStudents).values({ schoolId: school.schoolId, parentId, studentId: otherChild });
  await test.seed.insert(s.studentEnrollments).values({ schoolId: school.schoolId, studentId: otherChild, classId: otherClass, academicYearId: school.yearId, effectiveFrom: '2025-09-01' });
  expect((await readPublished(db, a, { studentId: otherChild }, now)).schedules).toEqual([]);
  await expect(readPublished(db, a, { studentId: randomUUID() }, now)).rejects.toThrow(); await expect(readPublished(db, { ...a, schoolId: (await seedSchool(test.seed)).schoolId }, {}, now)).rejects.toThrow();
  await expect(readPublished(db, a, { classId: school.classId }, now)).rejects.toThrow(); await expect(publishDraft(db, a, input(), now)).rejects.toThrow();
  await test.seed.update(s.studentEnrollments).set({ effectiveUntil: '2025-09-07', status: 'ENDED' }).where(eq(s.studentEnrollments.studentId, actors.studentId)); expect((await readPublished(db, a, { studentId: actors.studentId, date: '2025-09-08' }, now)).schedules).toEqual([]);
  await test.seed.update(s.parentStudents).set({ status: 'ENDED' }).where(eq(s.parentStudents.id, relationship)); await expect(readPublished(db, a, { studentId: actors.studentId }, now)).rejects.toThrow();
});
it('denies inactive actors and platform-only access, preserving published history', async () => {
  await publishDraft(db, actor, input(), now); await test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, actor.userId)); await expect(readPublished(db, actor, {}, now)).rejects.toThrow(); await expect(publishDraft(db, actor, input(1, '2025-09-08'), now)).rejects.toThrow();
  await test.seed.update(s.users).set({ status: 'ACTIVE' }).where(eq(s.users.id, actor.userId)); await test.seed.update(s.schoolMemberships).set({ role: 'SUPER_ADMIN' }).where(eq(s.schoolMemberships.userId, actor.userId)); await expect(readPublished(db, actor, {}, now)).rejects.toThrow(); expect(await test.seed.select().from(s.timetablePublications)).toHaveLength(1);
});
it('checks the published timeline even when the other draft moved; permits replacement-boundary adjacency', async () => {
  await publishDraft(db, actor, input(), now);
  draft = await saveDraft(db, actor, draftBody(1, '09:00', '10:00'));
  await publishDraft(db, actor, input(1, '2025-09-08'), now);
  const [original] = await test.seed.select().from(s.classes).where(eq(s.classes.id, school.classId));
  const classId = randomUUID(), assignmentId = randomUUID(); await test.seed.insert(s.classes).values({ ...original, id: classId, name: 'Second class' });
  await test.seed.insert(s.teacherAssignments).values({ id: assignmentId, schoolId: school.schoolId, classId, academicYearId: school.yearId, subjectId: school.subjectMathId, teacherId: actors.teacherId, effectiveFrom: '2025-09-01' });
  const body = draftBody(); body.classId = classId; body.lessons[0].teacherAssignmentId = assignmentId;
  const second = await saveDraft(db, actor, body);
  const publish = { ...input(), classId, draftId: second.id, expectedRevision: 1 };
  await expect(publishDraft(db, actor, publish, now)).rejects.toMatchObject({ details: { kind: 'SCHEDULING_CONFLICT', conflicts: expect.arrayContaining([expect.objectContaining({ kind: 'TEACHER' })]) } });
  await publishDraft(db, actor, { ...publish, effectiveFrom: '2025-09-08' }, now);
  expect((await readPublished(db, { ...actor, userId: actors.teacherUserId }, { date: '2025-09-08' }, now)).schedules).toHaveLength(2);
});
