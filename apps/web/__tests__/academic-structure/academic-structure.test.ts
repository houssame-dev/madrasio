import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { ForbiddenError } from '@/lib/errors';
import * as app from '@/lib/modules/academic-structure/application';
import type { AcademicStructureDb } from '@/lib/modules/academic-structure/infrastructure/repositories/academic-structure-repository';

import { createAuthTestDb, seedMembership, seedSchool, seedUser, type AuthTestDb } from '../auth/test-helpers';

let test: AuthTestDb;
let db: AcademicStructureDb;

beforeEach(async () => { test = await createAuthTestDb(); db = test.seed as unknown as AcademicStructureDb; });

async function actor(role: 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT' = 'SCHOOL_ADMIN', schoolName = 'School A') {
  const school = await seedSchool(test.seed, schoolName);
  const userId = await seedUser(test.seed);
  await seedMembership(test.seed, userId, school.id, role);
  const context = await requireCurrentContext(test.db, { sessionResolver: async () => ({ id: userId }), readSelectedSchoolId: async () => school.id });
  return { userId: context.userId, schoolId: context.schoolContext!.schoolId };
}

async function structure(a: app.Actor) {
  const year = await app.createAcademicYear(db, a, { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' });
  const stage = await app.createStage(db, a, { name: 'Primary', sequence: 1 });
  const level = await app.createLevel(db, a, { stageId: stage.id, name: 'Year 1', sequence: 1 });
  const curriculum = await app.createCurriculum(db, a, { name: 'National' });
  const version = await app.createCurriculumVersion(db, a, curriculum.id, { name: '2025-2026' });
  return { year, stage, level, curriculum, version };
}

describe('AcademicYear and AcademicPeriod application rules', () => {
  it('lists only the current School, creates safely, and hides foreign detail', async () => {
    const a = await actor(); const yearA = await app.createAcademicYear(db, a, { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' });
    const b = await actor('SCHOOL_ADMIN', 'School B'); await app.createAcademicYear(db, b, { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01' });
    const list = await app.listAcademicYears(db, a, { page: 1, pageSize: 50 });
    expect(list.data.map((row) => row.id)).toEqual([yearA.id]);
    await expect(app.getAcademicYear(db, b, yearA.id)).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
  });

  it('allows only PLANNED → ACTIVE → CLOSED → ARCHIVED', async () => {
    const a = await actor(); const year = await app.createAcademicYear(db, a, { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' });
    await app.patchAcademicYear(db, a, year.id, { status: 'ACTIVE' });
    await expect(app.patchAcademicYear(db, a, year.id, { status: 'ARCHIVED' })).rejects.toMatchObject({ featureCode: 'INVALID_STATUS_TRANSITION' });
    const closed = await app.patchAcademicYear(db, a, year.id, { status: 'CLOSED' });
    expect((await app.patchAcademicYear(db, a, closed.id, { status: 'ARCHIVED' })).status).toBe('ARCHIVED');
  });

  it('enforces period ordering, year containment, and same-School parent', async () => {
    const a = await actor(); const year = await app.createAcademicYear(db, a, { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' });
    const period = await app.createAcademicPeriod(db, a, year.id, { name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-20' });
    expect(period.academicYearId).toBe(year.id);
    await expect(app.createAcademicPeriod(db, a, year.id, { name: 'Bad', sequence: 2, startDate: '2025-08-01', endDate: '2025-12-01' })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    const b = await actor('SCHOOL_ADMIN', 'School B');
    await expect(app.createAcademicPeriod(db, b, year.id, { name: 'Term', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-01' })).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
  });
});

describe('Stage, Level, Track and Subject', () => {
  it('validates Level → Stage tenant integrity and supports lifecycle updates', async () => {
    const a = await actor(); const stage = await app.createStage(db, a, { name: 'Primary', sequence: 1 });
    const level = await app.createLevel(db, a, { stageId: stage.id, name: 'Year 1', sequence: 1 });
    expect((await app.patchLevel(db, a, level.id, { status: 'INACTIVE' })).status).toBe('INACTIVE');
    const b = await actor('SCHOOL_ADMIN', 'School B');
    await expect(app.createLevel(db, b, { stageId: stage.id, name: 'Foreign', sequence: 1 })).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
  });

  it('models Track exactly as a school-scoped optional structure', async () => {
    const a = await actor(); const track = await app.createTrack(db, a, { name: 'Sciences', sequence: 1 });
    expect((await app.patchTrack(db, a, track.id, { status: 'INACTIVE' })).status).toBe('INACTIVE');
  });

  it('keeps coefficient off Subject and safely handles duplicate names/cross-school reads', async () => {
    const a = await actor(); const subject = await app.createSubject(db, a, { name: 'Mathematics', code: 'MATH' });
    expect(subject).not.toHaveProperty('coefficient');
    await expect(app.createSubject(db, a, { name: 'Mathematics' })).rejects.toMatchObject({ featureCode: 'DUPLICATE_RESOURCE' });
    const b = await actor('SCHOOL_ADMIN', 'School B'); await expect(app.getSubject(db, b, subject.id)).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
  });
});

describe('Curriculum versioning and coefficients', () => {
  it('creates curricula/versions and rejects duplicate per-Curriculum version names', async () => {
    const a = await actor(); const curriculum = await app.createCurriculum(db, a, { name: 'National' });
    await app.createCurriculumVersion(db, a, curriculum.id, { name: 'v1' });
    await expect(app.createCurriculumVersion(db, a, curriculum.id, { name: 'v1' })).rejects.toMatchObject({ featureCode: 'DUPLICATE_RESOURCE' });
  });

  it('requires same-School Curriculum and surfaces no global active-version assumption', async () => {
    const a = await actor(); const curriculum = await app.createCurriculum(db, a, { name: 'National' });
    const b = await actor('SCHOOL_ADMIN', 'School B');
    await expect(app.createCurriculumVersion(db, b, curriculum.id, { name: 'v1' })).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
    const v1 = await app.createCurriculumVersion(db, a, curriculum.id, { name: 'v1', status: 'ACTIVE' });
    const v2 = await app.createCurriculumVersion(db, a, curriculum.id, { name: 'v2', status: 'ACTIVE' });
    expect([v1.status, v2.status]).toEqual(['ACTIVE', 'ACTIVE']);
  });

  it('attaches a positive decimal coefficient once and freezes active versions', async () => {
    const a = await actor(); const { version } = await structure(a); const subject = await app.createSubject(db, a, { name: 'Mathematics' });
    const attached = await app.createCurriculumSubject(db, a, version.id, { subjectId: subject.id, coefficient: '5.25' });
    expect(attached.coefficient).toBe('5.25');
    await expect(app.createCurriculumSubject(db, a, version.id, { subjectId: subject.id, coefficient: '7' })).rejects.toMatchObject({ featureCode: 'DUPLICATE_RESOURCE' });
    await app.patchCurriculumVersion(db, a, version.id, { status: 'ACTIVE' });
    await expect(app.patchCurriculumSubject(db, a, attached.id, { coefficient: '6' })).rejects.toMatchObject({ featureCode: 'CURRICULUM_VERSION_IMMUTABLE' });
  });

  it('rejects cross-school subjects and non-positive coefficients at validation', async () => {
    const a = await actor(); const { version } = await structure(a); const b = await actor('SCHOOL_ADMIN', 'School B'); const foreign = await app.createSubject(db, b, { name: 'Physics' });
    await expect(app.createCurriculumSubject(db, a, version.id, { subjectId: foreign.id, coefficient: '2' })).rejects.toMatchObject({ featureCode: 'NOT_FOUND' });
    const { curriculumSubjectCreateSchema, subjectCreateSchema } = await import('@/lib/modules/academic-structure/domain');
    expect(curriculumSubjectCreateSchema.safeParse({ subjectId: foreign.id, coefficient: 0 }).success).toBe(false);
    expect(subjectCreateSchema.safeParse({ name: 'Chemistry', coefficient: 3 }).success).toBe(false);
    expect(schema.curriculumSubjects).toBeDefined();
  });
});

describe('Class historical identity and authorization', () => {
  it('creates an exact year-bound Class, validates every relation, and follows lifecycle', async () => {
    const a = await actor(); const s = await structure(a);
    const klass = await app.createClass(db, a, { academicYearId: s.year.id, levelId: s.level.id, curriculumVersionId: s.version.id, name: 'Class A' });
    expect(klass.academicYearId).toBe(s.year.id);
    expect((await app.patchClass(db, a, klass.id, { status: 'CLOSED' })).status).toBe('CLOSED');
    await expect(app.patchClass(db, a, klass.id, { status: 'ACTIVE' })).rejects.toMatchObject({ featureCode: 'INVALID_STATUS_TRANSITION' });
  });

  it('does not accept academicYearId in the Class patch contract', async () => {
    const { classPatchSchema } = await import('@/lib/modules/academic-structure/domain');
    expect(classPatchSchema.safeParse({ academicYearId: randomUUID() }).success).toBe(false);
  });

  it('denies Teacher/Parent management, allows Teacher read, and denies missing user context', async () => {
    const admin = await actor(); await app.createSubject(db, admin, { name: 'Math' });
    const teacher = await actor('TEACHER', 'Teacher School');
    expect((await app.listSubjects(db, teacher, { page: 1, pageSize: 50 })).data).toEqual([]);
    await expect(app.createSubject(db, teacher, { name: 'Physics' })).rejects.toBeInstanceOf(ForbiddenError);
    const parent = await actor('PARENT', 'Parent School');
    await expect(app.listSubjects(db, parent, { page: 1, pageSize: 50 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(app.listSubjects(db, { userId: null, schoolId: admin.schoolId }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
