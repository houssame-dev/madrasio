import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@school/database';
import * as app from '@/lib/modules/academic-structure/application';
import * as repo from '@/lib/modules/academic-structure/infrastructure/repositories/academic-structure-repository';
import { createGradesTestDb, seedSchool, seedStudentAndActors, type GradesTestDb } from '../grades/test-helpers';

let test: GradesTestDb;
beforeEach(async () => { test = await createGradesTestDb(); });
afterEach(async () => { vi.restoreAllMocks(); await test.client.close(); });

async function setup() {
  const s = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, s.schoolId, s.yearId, s.classId);
  const actor = { schoolId: s.schoolId, userId: actors.schoolAdminUserId };
  const original = await app.getClass(test.db, actor, s.classId);
  const klass = await app.createClass(test.db, actor, {
    name: 'Unused', academicYearId: s.yearId, levelId: original.levelId, curriculumVersionId: s.curriculumVersionId,
  });
  const version = await app.getCurriculumVersion(test.db, actor, s.curriculumVersionId);
  const replacement = await app.createCurriculumVersion(test.db, actor, version.curriculumId, { name: 'Replacement', status: 'ACTIVE' });
  return { s, actors, actor, klass, replacement };
}

it.each(['enrollment', 'assignment', 'gradebook', 'subject-result', 'period-result', 'annual-result', 'attendance', 'homework'] as const)(
  'freezes the binding for independent %s history, including ended records', async (kind) => {
    const { s, actors, actor, klass, replacement } = await setup();
    expect(klass.canChangeCurriculum).toBe(true);
    const context = { schoolId: s.schoolId, academicYearId: s.yearId, classId: klass.id };
    const result = { ...context, studentId: actors.studentId, gradingConfigurationVersionId: s.configVersionId, value: '15' };
    if (kind === 'enrollment') await test.seed.insert(schema.studentEnrollments).values({ ...context, studentId: actors.studentId, effectiveFrom: '2025-09-01', effectiveUntil: '2025-10-01', status: 'ENDED' });
    if (kind === 'assignment') await test.seed.insert(schema.teacherAssignments).values({ ...context, teacherId: actors.teacherId, subjectId: s.subjectMathId, effectiveFrom: '2025-09-01', effectiveUntil: '2025-10-01', status: 'ENDED' });
    if (kind === 'gradebook') await test.seed.insert(schema.gradebooks).values({ ...context, academicPeriodId: s.period1Id, subjectId: s.subjectMathId, gradingConfigurationVersionId: s.configVersionId });
    if (kind === 'subject-result') await test.seed.insert(schema.subjectResults).values({ ...result, academicPeriodId: s.period1Id, subjectId: s.subjectMathId });
    if (kind === 'period-result') await test.seed.insert(schema.periodResults).values({ ...result, academicPeriodId: s.period1Id });
    if (kind === 'annual-result') await test.seed.insert(schema.annualResults).values(result);
    if (kind === 'attendance') await test.seed.insert(schema.attendanceRecords).values({ ...context, studentId: actors.studentId, attendanceDate: '2025-10-10', status: 'PRESENT' });
    if (kind === 'homework') {
      const [homework] = await test.seed.insert(schema.homework).values({ schoolId: s.schoolId, teacherId: actors.teacherId, subjectId: s.subjectMathId, academicYearId: s.yearId, academicPeriodId: s.period1Id, title: 'History', dueDate: '2025-11-01' }).returning();
      await test.seed.insert(schema.homeworkTargets).values({ ...context, homeworkId: homework.id, targetType: 'CLASS' });
    }
    expect((await app.getClass(test.db, actor, klass.id)).canChangeCurriculum).toBe(false);
    expect((await app.listClasses(test.db, actor, { page: 1, pageSize: 50 })).data.find(row => row.id === klass.id)?.canChangeCurriculum).toBe(false);
    await expect(app.patchClass(test.db, actor, klass.id, { curriculumVersionId: replacement.id })).rejects.toMatchObject({ featureCode: 'CLASS_CURRICULUM_IMMUTABLE' });
    expect((await app.getClass(test.db, actor, klass.id)).curriculumVersionId).toBe(s.curriculumVersionId);
    expect((await app.patchClass(test.db, actor, klass.id, { name: 'Safe metadata' })).name).toBe('Safe metadata');
  },
);

it('uses a Class lock before a separate history read, and a version lock before update, on one transaction', async () => {
  const { actor, klass, replacement } = await setup();
  const lock = vi.spyOn(repo, 'findClassForUpdate');
  const history = vi.spyOn(repo, 'classHasAcademicHistory');
  const version = vi.spyOn(repo, 'findCurriculumVersionForShare');
  const update = vi.spyOn(repo, 'updateClass');
  await app.patchClass(test.db, actor, klass.id, { curriculumVersionId: replacement.id });
  expect(lock.mock.invocationCallOrder[0]).toBeLessThan(history.mock.invocationCallOrder[0]);
  expect(history.mock.invocationCallOrder[0]).toBeLessThan(version.mock.invocationCallOrder[0]);
  expect(version.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  const tx = lock.mock.calls[0][0];
  expect(tx).not.toBe(test.db);
  for (const spy of [history, version, update]) expect(spy.mock.calls[0][0]).toBe(tx);
});

it('does not release historical protection when an enrollment ends', async () => {
  const { s, actor, replacement } = await setup();
  await test.seed.update(schema.studentEnrollments).set({ status: 'ENDED', effectiveUntil: '2025-10-01' }).where(eq(schema.studentEnrollments.classId, s.classId));
  await expect(app.patchClass(test.db, actor, s.classId, { curriculumVersionId: replacement.id })).rejects.toMatchObject({ featureCode: 'CLASS_CURRICULUM_IMMUTABLE' });
});

it('emits full UPDATE/SHARE locks at READ COMMITTED and uses immediate Class foreign keys', async () => {
  const { actor, klass, replacement } = await setup();
  const statements: string[] = [];
  const loggedDb = drizzle(test.client, { schema, logger: { logQuery(query) { statements.push(query); } } }) as unknown as repo.AcademicStructureDb;
  await app.patchClass(loggedDb, actor, klass.id, { curriculumVersionId: replacement.id });
  expect(statements.some(query => /isolation level read committed/i.test(query))).toBe(true);
  const classLock = statements.findIndex(query => /from "classes".*for update/i.test(query));
  const historyRead = statements.findIndex(query => /select \(exists/i.test(query));
  const versionLock = statements.findIndex(query => /from "curriculum_versions".*for share/i.test(query));
  const update = statements.findIndex(query => /update "classes"/i.test(query));
  expect(classLock).toBeGreaterThan(-1);
  expect(historyRead).toBeGreaterThan(classLock);
  expect(versionLock).toBeGreaterThan(historyRead);
  expect(update).toBeGreaterThan(versionLock);
  // PGlite proves emitted SQL/schema contracts, not multi-session lock scheduling.
  // PostgreSQL FK KEY SHARE conflicts with full UPDATE (not NO KEY UPDATE).
  const constraints = await test.client.query<{ table_name: string; condeferrable: boolean; convalidated: boolean }>(
    `select conrelid::regclass::text as table_name, condeferrable, convalidated
     from pg_constraint where contype = 'f' and confrelid = 'public.classes'::regclass`,
  );
  for (const table of ['student_enrollments', 'teacher_assignments', 'gradebooks', 'subject_results', 'period_results', 'annual_results', 'result_publications', 'attendance_records', 'homework_targets']) {
    expect(constraints.rows).toContainEqual({ table_name: table, condeferrable: false, convalidated: true });
  }
});
