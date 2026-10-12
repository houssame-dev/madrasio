import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as app from '@/lib/modules/students/application';
import { dateOfBirthSchema, studentCreateSchema, studentPatchSchema } from '@/lib/modules/students/domain/contracts';
import { createActor, createStudentsTestContext, seedParentRelationship, seedStudent, seedTeacherScope, type StudentsTestContext } from './test-helpers';
import { seedSchool } from '../auth/test-helpers';

describe('strict date-only Student DOB contracts', () => {
  it.each(['2000-02-29', '2024-02-29', '1900-02-28', '0001-01-01'])('accepts %s without an age rule', (dateOfBirth) => {
    expect(dateOfBirthSchema.parse(dateOfBirth)).toBe(dateOfBirth);
  });
  it.each(['1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '0000-01-01', '2024-2-01', '2024-01-01T00:00:00Z', ' 2024-01-01', '', 'not a date'])('rejects %s', (value) => {
    expect(dateOfBirthSchema.safeParse(value).success).toBe(false);
  });
  it('requires DOB on create but permits omission, not null/blank, on legacy PATCH', () => {
    expect(studentCreateSchema.safeParse({ firstName: 'A', lastName: 'B' }).success).toBe(false);
    expect(studentPatchSchema.safeParse({ firstName: 'Corrected' }).success).toBe(true);
    for (const dateOfBirth of [null, '']) expect(studentPatchSchema.safeParse({ dateOfBirth }).success).toBe(false);
  });
});

describe('School-local DOB and narrow management presentation', () => {
  let c: StudentsTestContext;
  beforeEach(async () => { c = await createStudentsTestContext(); });
  afterEach(async () => { vi.useRealTimers(); await c.test.client.close(); });
  const input = { firstName: 'Date', lastName: 'Only', dateOfBirth: '2012-02-29' };

  it('preserves unknown legacy DOB and enrollment history across unrelated and DOB edits', async () => {
    const legacy = await seedStudent(c.test, c.schoolId);
    await app.createEnrollment(c.db, c.admin, legacy.id, { academicYearId: c.yearId, classId: c.classAId, effectiveFrom: '2025-09-01' });
    const history = await app.listEnrollmentHistory(c.db, c.admin, legacy.id, { page: 1, pageSize: 50 });
    expect(await app.patchStudent(c.db, c.admin, legacy.id, { firstName: 'Corrected' })).toMatchObject({ id: legacy.id, dateOfBirth: null });
    expect(await app.patchStudent(c.db, c.admin, legacy.id, { dateOfBirth: input.dateOfBirth })).toMatchObject({ dateOfBirth: '2012-02-29' });
    expect(await app.listEnrollmentHistory(c.db, c.admin, legacy.id, { page: 1, pageSize: 50 })).toEqual(history);
  });

  it.each([
    ['America/Los_Angeles', '2026-01-01', '2026-01-02'],
    ['Pacific/Kiritimati', '2026-01-02', '2026-01-03'],
  ])('uses stored %s today, not UTC or the browser', async (timezone, today, tomorrow) => {
    await c.test.seed.update(schema.schools).set({ timezone }).where(eq(schema.schools.id, c.schoolId));
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T00:30:00Z'));
    const student = await app.createStudent(c.db, c.admin, { ...input, dateOfBirth: today });
    expect(student.dateOfBirth).toBe(today);
    await expect(app.createStudent(c.db, c.admin, { ...input, dateOfBirth: tomorrow })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(app.patchStudent(c.db, c.admin, student.id, { dateOfBirth: tomorrow })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await app.getStudent(c.db, c.admin, student.id)).dateOfBirth).toBe(today);
  });

  it('revalidates malformed DOB at the service and fails closed on invalid School timezone', async () => {
    await expect(app.createStudent(c.db, c.admin, { ...input, dateOfBirth: '2023-02-29' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const legacy = await seedStudent(c.test, c.schoolId);
    await c.test.seed.update(schema.schools).set({ timezone: 'Invalid/Zone' }).where(eq(schema.schools.id, c.schoolId));
    await expect(app.patchStudent(c.db, c.admin, legacy.id, { dateOfBirth: input.dateOfBirth })).rejects.toMatchObject({ featureCode: 'INVALID_SCHOOL_TIMEZONE' });
    expect(await app.patchStudent(c.db, c.admin, legacy.id, { firstName: 'Still editable' })).toMatchObject({ dateOfBirth: null });
  });

  it('retains active membership requirements for DOB reads and writes', async () => {
    const student = await app.createStudent(c.db, c.admin, input);
    await c.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(schema.schoolMemberships.userId, c.admin.userId!));
    await expect(app.getStudent(c.db, c.admin, student.id)).rejects.toThrow();
    await expect(app.patchStudent(c.db, c.admin, student.id, { dateOfBirth: '2010-01-01' })).rejects.toThrow();
    const [unchanged] = await c.test.seed.select().from(schema.students).where(eq(schema.students.id, student.id));
    expect(unchanged.dateOfBirth).toBe(input.dateOfBirth);
  });

  it('returns DOB only in management detail/mutations, never scoped Teacher/Parent or list responses', async () => {
    const student = await app.createStudent(c.db, c.admin, input);
    expect(await app.getStudent(c.db, c.admin, student.id)).toMatchObject({ dateOfBirth: input.dateOfBirth });
    await app.createEnrollment(c.db, c.admin, student.id, { academicYearId: c.yearId, classId: c.classAId, effectiveFrom: '2025-09-01' });
    const teacher = await createActor(c.test, c.schoolId, 'TEACHER');
    await seedTeacherScope(c, teacher, c.classAId);
    const parent = await createActor(c.test, c.schoolId, 'PARENT');
    await seedParentRelationship(c, parent, student.id);
    for (const actor of [teacher, parent]) {
      expect(await app.getStudent(c.db, actor, student.id)).not.toHaveProperty('dateOfBirth');
      await expect(app.patchStudent(c.db, actor, student.id, { dateOfBirth: '2010-01-01' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.createStudent(c.db, actor, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    for (const actor of [c.admin, teacher]) expect((await app.listStudents(c.db, actor, { page: 1, pageSize: 50 })).data[0]).not.toHaveProperty('dateOfBirth');
    const otherSchool = await seedSchool(c.test.seed, 'Foreign');
    const foreign = await createActor(c.test, otherSchool.id, 'SCHOOL_ADMIN');
    await expect(app.patchStudent(c.db, foreign, student.id, { dateOfBirth: input.dateOfBirth })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    await expect(app.getStudent(c.db, foreign, student.id)).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    await expect(app.patchStudent(c.db, { ...c.admin, userId: null }, student.id, { dateOfBirth: input.dateOfBirth })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
