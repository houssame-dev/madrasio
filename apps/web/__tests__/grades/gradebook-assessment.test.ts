import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import * as app from '@/lib/modules/grades/application';
import {
  assessmentCreateSchema, assessmentPatchSchema, gradebookCreateSchema, gradebookPatchSchema,
} from '@/lib/modules/grades/domain';

import { seedParentActor, seedSchool } from './test-helpers';
import {
  assignTeacher, createGradebookTestContext, gradebookInput, seedGrade,
  type GradebookTestContext,
} from './gradebook-test-helpers';

let context: GradebookTestContext;
beforeEach(async () => { context = await createGradebookTestContext(); });

const assessmentInput = (title = 'Quiz 1') => ({
  title,
  assessmentType: 'QUIZ' as const,
  maximumScore: '20.00',
  weight: '1.50',
  assessmentDate: '2025-10-01',
});

describe('Gradebook application contracts', () => {
  it('discovers only current-School ACTIVE configuration/version options with safe DTOs and deterministic pagination', async () => {
    const [alpha] = await context.test.seed.insert(schema.gradingConfigurations).values({
      schoolId: context.school.schoolId, name: 'Alpha', status: 'ACTIVE',
    }).returning();
    const [alphaVersion] = await context.test.seed.insert(schema.gradingConfigurationVersions).values({
      schoolId: context.school.schoolId, gradingConfigurationId: alpha.id,
      versionNumber: 3, status: 'ACTIVE', rules: { secret: 'not exposed' },
    }).returning();
    const [inactive] = await context.test.seed.insert(schema.gradingConfigurations).values({
      schoolId: context.school.schoolId, name: 'Inactive', status: 'INACTIVE',
    }).returning();
    await context.test.seed.insert(schema.gradingConfigurationVersions).values({
      schoolId: context.school.schoolId, gradingConfigurationId: inactive.id,
      versionNumber: 1, status: 'ACTIVE', rules: {},
    });
    const [draftConfig] = await context.test.seed.insert(schema.gradingConfigurations).values({
      schoolId: context.school.schoolId, name: 'Draft only', status: 'ACTIVE',
    }).returning();
    await context.test.seed.insert(schema.gradingConfigurationVersions).values([
      { schoolId: context.school.schoolId, gradingConfigurationId: draftConfig.id, versionNumber: 1, status: 'DRAFT', rules: {} },
      { schoolId: context.school.schoolId, gradingConfigurationId: draftConfig.id, versionNumber: 2, status: 'ARCHIVED', rules: {} },
    ]);
    const foreign = await seedSchool(context.test.seed);
    const first = await app.listEligibleGradingConfigurationVersions(
      context.db, context.admin, { page: 1, pageSize: 1 },
    );
    const second = await app.listEligibleGradingConfigurationVersions(
      context.db, context.admin, { page: 2, pageSize: 1 },
    );
    expect(first).toEqual({
      data: [{ id: alphaVersion.id, versionNumber: 3, configuration: { id: alpha.id, name: 'Alpha' } }],
      meta: { page: 1, pageSize: 1, total: 2 },
    });
    expect(second.data[0]).toMatchObject({ id: context.school.configVersionId, configuration: { name: 'Default' } });
    expect([...first.data, ...second.data]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: foreign.configVersionId }),
    ]));
    expect(first.data[0]).not.toHaveProperty('rules');
    expect(first.data[0]).not.toHaveProperty('schoolId');
    expect(first.data[0]).not.toHaveProperty('status');
  });

  it('allows Gradebook-authorized Teachers, denies Parents, and returns an empty eligible list normally', async () => {
    expect((await app.listEligibleGradingConfigurationVersions(
      context.db, context.teacher, { page: 1, pageSize: 50 },
    )).data).toHaveLength(1);
    const { parentUserId } = await seedParentActor(context.test.seed, context.school.schoolId);
    await expect(app.listEligibleGradingConfigurationVersions(context.db, {
      userId: parentUserId, schoolId: context.school.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.gradingConfigurationVersions).set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, context.school.configVersionId));
    expect(await app.listEligibleGradingConfigurationVersions(
      context.db, context.admin, { page: 1, pageSize: 50 },
    )).toEqual({ data: [], meta: { page: 1, pageSize: 50, total: 0 } });
  });

  it('creates a DRAFT Gradebook with server school and exact configuration binding', async () => {
    const created = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    expect(created).toMatchObject({
      status: 'DRAFT',
      gradingConfigurationVersionId: context.school.configVersionId,
    });
    expect(created).not.toHaveProperty('schoolId');
    expect(gradebookCreateSchema.safeParse({ ...gradebookInput(context), schoolId: randomUUID() }).success)
      .toBe(false);
  });

  it('lists only current-School rows with filters and deterministic pagination', async () => {
    const first = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    await app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context, context.school.subjectPhysicsId), name: 'Physics',
    });
    const listed = await app.listGradebooks(context.db, context.admin, {
      page: 1, pageSize: 1, subjectId: context.school.subjectMathId,
    });
    expect(listed).toMatchObject({ data: [{ id: first.id }], meta: { page: 1, pageSize: 1, total: 1 } });
  });

  it('rejects duplicate logical context even with another configuration version', async () => {
    const historical = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    const [configuration] = await context.test.seed.select().from(schema.gradingConfigurations)
      .where(eq(schema.gradingConfigurations.schoolId, context.school.schoolId)).limit(1);
    await context.test.seed.update(schema.gradingConfigurationVersions).set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, context.school.configVersionId));
    const [version2] = await context.test.seed.insert(schema.gradingConfigurationVersions).values({
      schoolId: context.school.schoolId,
      gradingConfigurationId: configuration.id,
      versionNumber: 2,
      status: 'ACTIVE',
      rules: {},
    }).returning();
    await expect(app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context), gradingConfigurationVersionId: version2.id,
    })).rejects.toMatchObject({ featureCode: 'DUPLICATE_GRADEBOOK' });
    expect((await app.getGradebook(context.db, context.admin, historical.id)).gradingConfigurationVersionId)
      .toBe(context.school.configVersionId);
  });

  it('validates exact operational Year, Period, Class, Subject and active config context', async () => {
    const [otherYear] = await context.test.seed.insert(schema.academicYears).values({
      schoolId: context.school.schoolId,
      name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01', status: 'ACTIVE',
    }).returning();
    const [otherPeriod] = await context.test.seed.insert(schema.academicPeriods).values({
      schoolId: context.school.schoolId,
      academicYearId: otherYear.id,
      name: 'Term 1', sequence: 1, startDate: '2026-09-01', endDate: '2026-12-20', status: 'ACTIVE',
    }).returning();
    await expect(app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context), academicYearId: otherYear.id, academicPeriodId: otherPeriod.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });
    await expect(app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context), academicPeriodId: otherPeriod.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });

    await context.test.seed.update(schema.academicPeriods).set({ status: 'CLOSED' })
      .where(eq(schema.academicPeriods.id, context.school.period1Id));
    await expect(app.createGradebook(context.db, context.admin, gradebookInput(context)))
      .rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });
    await context.test.seed.update(schema.academicPeriods).set({ status: 'PLANNED' })
      .where(eq(schema.academicPeriods.id, context.school.period1Id));
    await context.test.seed.update(schema.subjects).set({ status: 'INACTIVE' })
      .where(eq(schema.subjects.id, context.school.subjectMathId));
    await expect(app.createGradebook(context.db, context.admin, gradebookInput(context)))
      .rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });
    await context.test.seed.update(schema.subjects).set({ status: 'ACTIVE' })
      .where(eq(schema.subjects.id, context.school.subjectMathId));
    await context.test.seed.update(schema.gradingConfigurationVersions).set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, context.school.configVersionId));
    await expect(app.createGradebook(context.db, context.admin, gradebookInput(context)))
      .rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });
  });

  it('hides foreign detail and rejects cross-context relationships', async () => {
    await context.test.seed.update(schema.schools).set({ name: 'Primary School' })
      .where(eq(schema.schools.id, context.school.schoolId));
    const foreign = await seedSchool(context.test.seed);
    const [foreignGradebook] = await context.test.seed.insert(schema.gradebooks).values({
      schoolId: foreign.schoolId,
      academicYearId: foreign.yearId,
      academicPeriodId: foreign.period1Id,
      classId: foreign.classId,
      subjectId: foreign.subjectMathId,
      gradingConfigurationVersionId: foreign.configVersionId,
    }).returning();
    await expect(app.getGradebook(context.db, context.admin, foreignGradebook.id))
      .rejects.toMatchObject({ featureCode: 'GRADEBOOK_NOT_FOUND' });
    await expect(app.createGradebook(context.db, context.admin, {
      ...gradebookInput(context), academicPeriodId: foreign.period1Id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_CONTEXT' });
  });

  it('enforces conservative lifecycle and immutable context API', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    expect((await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'OPEN' })).status)
      .toBe('OPEN');
    expect((await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'CLOSED' })).status)
      .toBe('CLOSED');
    expect((await app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'ARCHIVED' })).status)
      .toBe('ARCHIVED');
    await expect(app.patchGradebook(context.db, context.admin, gradebook.id, { status: 'OPEN' }))
      .rejects.toMatchObject({ featureCode: 'INVALID_GRADEBOOK_STATUS_TRANSITION' });
    for (const field of [
      'schoolId', 'academicYearId', 'academicPeriodId', 'classId', 'subjectId',
      'gradingConfigurationVersionId', 'teacherId', 'coefficient', 'gradingRules',
    ]) expect(gradebookPatchSchema.safeParse({ [field]: randomUUID() }).success).toBe(false);
  });

  it('grants exact Teacher assignment scope and removes access when assignment ends/profile deactivates', async () => {
    await assignTeacher(context);
    const own = await app.createGradebook(context.db, context.teacher, gradebookInput(context));
    await app.createGradebook(context.db, context.admin, gradebookInput(context, context.school.subjectPhysicsId));
    expect((await app.listGradebooks(context.db, context.teacher, { page: 1, pageSize: 50 })).data)
      .toEqual([expect.objectContaining({ id: own.id })]);
    await expect(app.createGradebook(context.db, context.teacher, {
      ...gradebookInput(context, context.school.subjectPhysicsId), academicPeriodId: context.school.period2Id,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED' }).where(and(
      eq(schema.teacherAssignments.teacherId, context.teacherId),
      eq(schema.teacherAssignments.subjectId, context.school.subjectMathId),
    ));
    await expect(app.getGradebook(context.db, context.teacher, own.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await context.test.seed.select().from(schema.gradebooks)
      .where(eq(schema.gradebooks.id, own.id))).length).toBe(1);

    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ACTIVE' }).where(and(
      eq(schema.teacherAssignments.teacherId, context.teacherId),
      eq(schema.teacherAssignments.subjectId, context.school.subjectMathId),
    ));
    await context.test.seed.update(schema.teachers).set({ status: 'INACTIVE' })
      .where(eq(schema.teachers.id, context.teacherId));
    await expect(app.getGradebook(context.db, context.teacher, own.id))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies unauthenticated, suspended, and inactive-membership actors', async () => {
    await expect(app.listGradebooks(context.db, {
      userId: null, schoolId: context.school.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await context.test.seed.update(schema.users).set({ status: 'SUSPENDED' })
      .where(eq(schema.users.id, context.admin.userId!));
    await expect(app.listGradebooks(context.db, context.admin, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.users).set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, context.admin.userId!));
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' }).where(and(
      eq(schema.schoolMemberships.userId, context.admin.userId!),
      eq(schema.schoolMemberships.schoolId, context.school.schoolId),
    ));
    await expect(app.listGradebooks(context.db, context.admin, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies Teacher scope for the same Subject in another Class', async () => {
    await assignTeacher(context);
    const [baseClass] = await context.test.seed.select().from(schema.classes)
      .where(eq(schema.classes.id, context.school.classId));
    const [otherClass] = await context.test.seed.insert(schema.classes).values({
      schoolId: context.school.schoolId,
      academicYearId: context.school.yearId,
      levelId: baseClass.levelId,
      curriculumVersionId: baseClass.curriculumVersionId,
      name: '5B',
    }).returning();
    await expect(app.createGradebook(context.db, context.teacher, {
      ...gradebookInput(context),
      academicPeriodId: context.school.period2Id,
      classId: otherClass.id,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies Parent management and raw administration reads', async () => {
    const { parentUserId } = await seedParentActor(context.test.seed, context.school.schoolId);
    const parent = { userId: parentUserId, schoolId: context.school.schoolId };
    await expect(app.listGradebooks(context.db, parent, { page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.createGradebook(context.db, parent, gradebookInput(context)))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Assessment application contracts', () => {
  it('creates and deterministically lists valid Assessments; duplicate titles are allowed', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    const first = await app.createAssessment(context.db, context.admin, gradebook.id, assessmentInput());
    const second = await app.createAssessment(context.db, context.admin, gradebook.id, {
      ...assessmentInput(), assessmentDate: '2025-10-02',
    });
    expect(first.title).toBe(second.title);
    const listed = await app.listAssessments(context.db, context.admin, gradebook.id, {
      page: 1, pageSize: 50, assessmentType: 'QUIZ',
    });
    expect(listed.data.map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it('uses decimal-safe numeric(6,2) inputs and rejects authoritative fields', () => {
    expect(assessmentCreateSchema.safeParse({ ...assessmentInput(), maximumScore: '0' }).success).toBe(false);
    expect(assessmentCreateSchema.safeParse({ ...assessmentInput(), weight: '-1' }).success).toBe(false);
    expect(assessmentCreateSchema.safeParse({ ...assessmentInput(), maximumScore: '10000' }).success).toBe(false);
    expect(assessmentCreateSchema.safeParse({ ...assessmentInput(), maximumScore: 1.234 }).success).toBe(false);
    expect(assessmentCreateSchema.safeParse({ ...assessmentInput(), assessmentType: 'MIDTERM' }).success).toBe(false);
    for (const field of ['schoolId', 'gradebookId', 'teacherId', 'coefficient', 'score']) {
      expect(assessmentPatchSchema.safeParse({ [field]: randomUUID() }).success).toBe(false);
    }
  });

  it('enforces assessment date within the AcademicPeriod', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    await expect(app.createAssessment(context.db, context.admin, gradebook.id, {
      ...assessmentInput(), assessmentDate: '2026-01-01',
    })).rejects.toMatchObject({ featureCode: 'INVALID_ASSESSMENT_DATE' });
  });

  it('rejects new Assessments after the AcademicPeriod closes', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    await context.test.seed.update(schema.academicPeriods).set({ status: 'CLOSED' })
      .where(eq(schema.academicPeriods.id, context.school.period1Id));
    await expect(app.createAssessment(context.db, context.admin, gradebook.id, assessmentInput()))
      .rejects.toMatchObject({ featureCode: 'GRADEBOOK_NOT_EDITABLE' });
  });

  it('enforces lifecycle and freezes published Assessment structure', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    const assessment = await app.createAssessment(context.db, context.admin, gradebook.id, assessmentInput());
    expect((await app.patchAssessment(context.db, context.admin, assessment.id, { status: 'PUBLISHED' })).status)
      .toBe('PUBLISHED');
    await expect(app.patchAssessment(context.db, context.admin, assessment.id, { maximumScore: '100' }))
      .rejects.toMatchObject({ featureCode: 'ASSESSMENT_NOT_EDITABLE' });
    expect((await app.patchAssessment(context.db, context.admin, assessment.id, { status: 'ARCHIVED' })).status)
      .toBe('ARCHIVED');
    await expect(app.patchAssessment(context.db, context.admin, assessment.id, { status: 'PUBLISHED' }))
      .rejects.toMatchObject({ featureCode: 'ASSESSMENT_NOT_EDITABLE' });
  });

  it('protects calculation fields once Grades exist and never deletes Grades on archive', async () => {
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    const assessment = await app.createAssessment(context.db, context.admin, gradebook.id, assessmentInput());
    await seedGrade(context, gradebook.id, assessment.id);
    await expect(app.patchAssessment(context.db, context.admin, assessment.id, { weight: '2' }))
      .rejects.toMatchObject({ featureCode: 'ASSESSMENT_NOT_EDITABLE' });
    await app.patchAssessment(context.db, context.admin, assessment.id, { status: 'ARCHIVED' });
    expect(await context.test.seed.select().from(schema.grades)
      .where(eq(schema.grades.assessmentId, assessment.id))).toHaveLength(1);
  });

  it('blocks Assessment mutation after Gradebook close and inherits exact Teacher scope', async () => {
    await assignTeacher(context);
    const gradebook = await app.createGradebook(context.db, context.teacher, gradebookInput(context));
    const assessment = await app.createAssessment(context.db, context.teacher, gradebook.id, assessmentInput());
    expect((await app.getAssessment(context.db, context.teacher, assessment.id)).id).toBe(assessment.id);
    await app.patchGradebook(context.db, context.teacher, gradebook.id, { status: 'OPEN' });
    await app.patchGradebook(context.db, context.teacher, gradebook.id, { status: 'CLOSED' });
    await expect(app.patchAssessment(context.db, context.teacher, assessment.id, { title: 'Changed' }))
      .rejects.toMatchObject({ featureCode: 'GRADEBOOK_NOT_EDITABLE' });
  });

  it('does not create Homework or copy CurriculumSubject coefficient', async () => {
    const before = await context.test.seed.select().from(schema.homework);
    const gradebook = await app.createGradebook(context.db, context.admin, gradebookInput(context));
    const assessment = await app.createAssessment(context.db, context.admin, gradebook.id, {
      ...assessmentInput(), assessmentType: 'HOMEWORK',
    });
    expect(assessment).not.toHaveProperty('coefficient');
    expect(await context.test.seed.select().from(schema.homework)).toEqual(before);
  });
});
