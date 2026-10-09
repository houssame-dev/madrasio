import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as s from '@school/database';
import * as service from '@/lib/modules/grades/application/configuration-service';
import * as audit from '@/lib/audit/repository';
import * as results from '@/lib/modules/grades/application';
import {
  configurationCreate,
  activationErrors,
  configurationRules,
} from '@/lib/modules/grades/domain/configuration-contracts';
import { createGradebookTestContext, type GradebookTestContext } from './gradebook-test-helpers';
import { DEFAULT_RULES, seedSchool, seedGradebook, seedGrades } from './test-helpers';

let c: GradebookTestContext;
beforeEach(async () => {
  c = await createGradebookTestContext();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await c.test.client.close();
});
const create = () =>
  service.createConfiguration(c.db, c.admin, { name: 'New rules', rules: DEFAULT_RULES });
const events = () => c.test.seed.select().from(s.auditEvents);

it('creates a draft, corrects unused rules, activates, versions without overwriting and audits exact actor/context', async () => {
  const config = await create();
  let detail = await service.getConfiguration(c.db, c.admin, config.id);
  const draft = detail.versions[0];
  expect(draft).toMatchObject({
    editable: true,
    hasHistory: false,
    versionNumber: 1,
    status: 'DRAFT',
  });
  const initialAudit = await events();
  await service.patchVersion(c.db, c.admin, config.id, draft.id, { rules: DEFAULT_RULES });
  expect(await events()).toEqual(initialAudit);
  const rules = { ...DEFAULT_RULES, rounding: { mode: 'HALF_EVEN', scale: 3 } };
  await service.patchVersion(c.db, c.admin, config.id, draft.id, { rules });
  await service.patchVersion(c.db, c.admin, config.id, draft.id, { status: 'ACTIVE' });
  await expect(
    service.patchVersion(c.db, c.admin, config.id, draft.id, { rules: DEFAULT_RULES }),
  ).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_LOCKED' });
  const next = await service.createVersion(c.db, c.admin, config.id, { rules: DEFAULT_RULES });
  await service.patchVersion(c.db, c.admin, config.id, next.id, { status: 'ACTIVE' });
  detail = await service.getConfiguration(c.db, c.admin, config.id);
  expect(detail.versions.map((v) => [v.versionNumber, v.status])).toEqual([
    [2, 'ACTIVE'],
    [1, 'ARCHIVED'],
  ]);
  expect(detail.versions[1].rules).toEqual(rules);
  const log = await events();
  expect(log.map((e) => e.action)).toEqual([
    'GradingConfigurationCreated',
    'GradingConfigurationVersionCreated',
    'GradingConfigurationRulesChanged',
    'GradingConfigurationVersionStatusChanged',
    'GradingConfigurationVersionCreated',
    'GradingConfigurationVersionStatusChanged',
    'GradingConfigurationVersionStatusChanged',
  ]);
  for (const event of log) {
    expect(event).toMatchObject({
      schoolId: c.admin.schoolId,
      actorUserId: c.admin.userId,
      scope: 'SCHOOL',
      actorKind: 'USER',
    });
    expect(event.metadata).toMatchObject({ configurationId: config.id });
    expect(
      Object.keys(event.metadata as object).every((k) =>
        ['configurationId', 'versionNumber', 'previousStatus', 'newStatus'].includes(k),
      ),
    ).toBe(true);
  }
  await service.patchVersion(c.db, c.admin, config.id, next.id, { status: 'ACTIVE' });
  expect(await events()).toHaveLength(log.length);
});
it.each(['TEACHER', 'PARENT', 'NONE', 'PLATFORM', 'FOREIGN_ADMIN'] as const)(
  'rejects %s for all administration operations',
  async (mode) => {
    const config = await create();
    const version = (await service.getConfiguration(c.db, c.admin, config.id)).versions[0];
    const actor = { ...c.teacher };
    if (mode === 'NONE') actor.userId = null;
    if (mode === 'PARENT')
      await c.test.seed
        .update(s.schoolMemberships)
        .set({ role: 'PARENT' })
        .where(eq(s.schoolMemberships.userId, actor.userId!));
    if (mode === 'PLATFORM') {
      await c.test.seed
        .update(s.users)
        .set({ isPlatformAdmin: true })
        .where(eq(s.users.id, actor.userId!));
      await c.test.seed
        .update(s.schoolMemberships)
        .set({ status: 'INACTIVE' })
        .where(eq(s.schoolMemberships.userId, actor.userId!));
    }
    if (mode === 'FOREIGN_ADMIN') actor.schoolId = (await seedSchool(c.test.seed)).schoolId;
    const before = await events();
    for (const action of [
      () => service.listConfigurations(c.db, actor),
      () => service.getConfiguration(c.db, actor, config.id),
      () => service.createConfiguration(c.db, actor, { name: 'Denied', rules: DEFAULT_RULES }),
      () => service.createVersion(c.db, actor, config.id, { rules: DEFAULT_RULES }),
      () => service.setConfigurationStatus(c.db, actor, config.id, { status: 'INACTIVE' }),
      () => service.patchVersion(c.db, actor, config.id, version.id, { rules: DEFAULT_RULES }),
    ])
      await expect(action()).rejects.toBeDefined();
    expect(await events()).toEqual(before);
  },
);
it('rejects foreign configuration/version composition and client-selected ownership', async () => {
  const config = await create();
  const foreign = await seedSchool(c.test.seed);
  const [version] = await c.test.seed
    .select()
    .from(s.gradingConfigurationVersions)
    .where(eq(s.gradingConfigurationVersions.id, foreign.configVersionId));
  await expect(
    service.getConfiguration(c.db, c.admin, version.gradingConfigurationId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    service.patchVersion(c.db, c.admin, config.id, version.id, { status: 'ACTIVE' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const field of ['schoolId', 'curriculumVersionId', 'subjectId', 'role', 'isPlatformAdmin']) {
    await expect(
      service.createConfiguration(c.db, c.admin, {
        name: 'No',
        rules: DEFAULT_RULES,
        [field]: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});
it('rejects duplicates and incomplete activation, keeps inactive/archived history readable', async () => {
  const config = await create();
  await expect(create()).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_DUPLICATE' });
  const empty = await service.createVersion(c.db, c.admin, config.id, {
    rules: { schemaVersion: 1 },
  });
  await expect(
    service.patchVersion(c.db, c.admin, config.id, empty.id, { status: 'ACTIVE' }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await service.setConfigurationStatus(c.db, c.admin, config.id, { status: 'INACTIVE' });
  await expect(
    service.createVersion(c.db, c.admin, config.id, { rules: DEFAULT_RULES }),
  ).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_STATE' });
  expect(
    (await service.getConfiguration(c.db, c.admin, config.id)).versions.every((v) => !v.editable),
  ).toBe(true);
  await service.setConfigurationStatus(c.db, c.admin, config.id, { status: 'ACTIVE' });
  await service.setConfigurationStatus(c.db, c.admin, config.id, { status: 'ARCHIVED' });
  expect((await service.getConfiguration(c.db, c.admin, config.id)).versions).toHaveLength(2);
  await expect(
    service.setConfigurationStatus(c.db, c.admin, config.id, { status: 'ACTIVE' }),
  ).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_STATE' });
});
it('rejects draft edits even if legacy/direct data already binds a Gradebook', async () => {
  const config = await create();
  const version = (await service.getConfiguration(c.db, c.admin, config.id)).versions[0];
  await seedGradebook(
    c.test.seed,
    c.school.schoolId,
    { ...c.school, configVersionId: version.id },
    c.school.subjectMathId,
  );
  await expect(
    service.patchVersion(c.db, c.admin, config.id, version.id, { rules: DEFAULT_RULES }),
  ).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_LOCKED' });
  expect((await service.getConfiguration(c.db, c.admin, config.id)).versions[0]).toMatchObject({
    editable: false,
    hasHistory: true,
  });
});
it('makes activated rules available to new Gradebooks and uses their intended output scale', async () => {
  const config = await service.createConfiguration(c.db, c.admin, {
    name: '100 point scale',
    rules: { ...DEFAULT_RULES, thresholds: { maxScore: 100, passingScore: 50 } },
  });
  const version = (await service.getConfiguration(c.db, c.admin, config.id)).versions[0];
  const input = {
    academicYearId: c.school.yearId,
    academicPeriodId: c.school.period1Id,
    classId: c.school.classId,
    subjectId: c.school.subjectMathId,
    gradingConfigurationVersionId: version.id,
  };
  await expect(results.createGradebook(c.db, c.admin, input)).rejects.toMatchObject({
    featureCode: 'INVALID_GRADEBOOK_CONTEXT',
  });
  await service.patchVersion(c.db, c.admin, config.id, version.id, { status: 'ACTIVE' });
  const book = await results.createGradebook(c.db, c.admin, input);
  await results.patchGradebook(c.db, c.admin, book.id, { status: 'OPEN' });
  const assessment = await results.createAssessment(c.db, c.admin, book.id, {
    title: 'Exam',
    assessmentType: 'EXAM',
    maximumScore: '20',
    weight: '1',
  });
  await results.patchAssessment(c.db, c.admin, assessment.id, { status: 'PUBLISHED' });
  const [student] = await c.test.seed.select().from(s.students).limit(1);
  await c.test.seed.insert(s.grades).values({
    schoolId: c.school.schoolId,
    gradebookId: book.id,
    assessmentId: assessment.id,
    studentId: student.id,
    score: '10',
    state: 'VALID',
  });
  const calculated = await results.calculateSubjectResult(c.test.db, {
    ...c.admin,
    gradebookId: book.id,
    studentId: student.id,
  });
  expect(calculated).toMatchObject({ value: '50.00', gradingConfigurationVersionId: version.id });
});
it('rolls back creation, draft edits and multi-version activation if audit persistence fails', async () => {
  const config = await create();
  const version = (await service.getConfiguration(c.db, c.admin, config.id)).versions[0];
  await service.patchVersion(c.db, c.admin, config.id, version.id, { status: 'ACTIVE' });
  const next = await service.createVersion(c.db, c.admin, config.id, { rules: DEFAULT_RULES });
  const before = await service.getConfiguration(c.db, c.admin, config.id);
  const log = await events();
  vi.spyOn(audit, 'appendAuditEvent').mockRejectedValue(new Error('synthetic audit failure'));
  for (const action of [
    () => service.createConfiguration(c.db, c.admin, { name: 'Rollback', rules: DEFAULT_RULES }),
    () =>
      service.patchVersion(c.db, c.admin, config.id, next.id, {
        rules: { ...DEFAULT_RULES, thresholds: { maxScore: 100, passingScore: 50 } },
      }),
    () => service.patchVersion(c.db, c.admin, config.id, next.id, { status: 'ACTIVE' }),
    () => service.setConfigurationStatus(c.db, c.admin, config.id, { status: 'ARCHIVED' }),
  ])
    await expect(action()).rejects.toMatchObject({ featureCode: 'AUDIT_PERSISTENCE_FAILED' });
  expect(await service.getConfiguration(c.db, c.admin, config.id)).toEqual(before);
  expect(await events()).toEqual(log);
  expect(
    (await service.listConfigurations(c.db, c.admin)).data.some((row) => row.name === 'Rollback'),
  ).toBe(false);
});
it('preserves grades, all results, publication snapshots and revision semantics after new activation and archive', async () => {
  const school = c.school;
  const [student] = await c.test.seed.select().from(s.students).limit(1);
  const math = await seedGradebook(c.test.seed, school.schoolId, school, school.subjectMathId);
  await seedGrades(c.test.seed, school.schoolId, math.gradebookId, math, student.id, '10', '10');
  const actor = c.admin;
  const context = {
    ...actor,
    studentId: student.id,
    classId: school.classId,
    academicYearId: school.yearId,
  };
  const subject = await results.calculateSubjectResult(c.test.db, {
    ...actor,
    studentId: student.id,
    gradebookId: math.gradebookId,
  });
  const period = await results.calculatePeriodResult(c.test.db, {
    ...context,
    academicPeriodId: school.period1Id,
  });
  const annual = await results.calculateAnnualResult(c.test.db, context);
  const originals = [];
  for (const [resultType, result] of [
    ['SUBJECT', subject],
    ['PERIOD', period],
    ['ANNUAL', annual],
  ] as const) {
    await results.finalizeResult(c.test.db, { ...actor, resultType, resultId: result.id });
    originals.push(
      await results.publishResult(c.test.db, {
        ...actor,
        resultType,
        resultId: result.id,
        idempotencyKey: randomUUID(),
      }),
    );
  }
  const snapshot = async () =>
    Promise.all(
      [
        s.grades,
        s.assessments,
        s.subjectResults,
        s.periodResults,
        s.annualResults,
        s.resultPublications,
      ].map((table) => c.test.seed.select().from(table)),
    );
  const before = await snapshot();
  const [old] = await c.test.seed
    .select()
    .from(s.gradingConfigurationVersions)
    .where(eq(s.gradingConfigurationVersions.id, school.configVersionId));
  const next = await service.createVersion(c.db, actor, old.gradingConfigurationId, {
    rules: { ...DEFAULT_RULES, thresholds: { maxScore: 100, passingScore: 50 } },
  });
  await service.patchVersion(c.db, actor, old.gradingConfigurationId, next.id, {
    status: 'ACTIVE',
  });
  await expect(
    service.patchVersion(c.db, actor, old.gradingConfigurationId, old.id, { rules: next.rules }),
  ).rejects.toMatchObject({ featureCode: 'GRADING_CONFIGURATION_LOCKED' });
  await service.setConfigurationStatus(c.db, actor, old.gradingConfigurationId, {
    status: 'ARCHIVED',
  });
  expect(await snapshot()).toEqual(before);
  for (const [resultType, result] of [
    ['SUBJECT', subject],
    ['PERIOD', period],
    ['ANNUAL', annual],
  ] as const) {
    const revised = await results.reviseResult(c.test.db, {
      ...actor,
      resultType,
      resultId: result.id,
      idempotencyKey: randomUUID(),
    });
    expect(revised.resultValue).toBe('10.00');
    expect(revised.gradingConfigurationVersionId).toBe(old.id);
    expect(revised.publicationVersion).toBe(2);
  }
  for (const original of originals) {
    const [stored] = await c.test.seed
      .select()
      .from(s.resultPublications)
      .where(eq(s.resultPublications.id, original.publicationId));
    expect(stored.resultValue).toBe(original.resultValue);
    expect(stored.gradingConfigurationVersionId).toBe(old.id);
  }
});
it('locks parent then full version before separate dependency checks at READ COMMITTED', () => {
  const source = readFileSync('lib/modules/grades/application/configuration-service.ts', 'utf8');
  const path = source.slice(source.indexOf('export async function patchVersion'));
  expect(path.indexOf('find(tx, actor, id, true)')).toBeLessThan(path.indexOf(".for('update')"));
  expect(path.indexOf(".for('update')")).toBeLessThan(path.indexOf('await used('));
  expect(path).toContain("isolationLevel: 'read committed'");
  const repository = readFileSync(
    'lib/modules/grades/infrastructure/repositories/gradebook-repository.ts',
    'utf8',
  );
  const locking = repository.slice(
    repository.indexOf('export async function lockConfigurationForSetup'),
    repository.indexOf('export async function listEligibleGradingConfigurationVersions'),
  );
  expect(locking.match(/\.for\('share'\)/g)).toHaveLength(2);
  expect(locking.indexOf('from(schema.gradingConfigurations)')).toBeLessThan(
    locking.lastIndexOf('from(schema.gradingConfigurationVersions)'),
  );
});
it('validates supported numeric, weighting, duplicate and closed-vocabulary settings without new formulas', () => {
  for (const rules of [
    { ...DEFAULT_RULES, thresholds: { maxScore: 0, passingScore: 10 } },
    { ...DEFAULT_RULES, thresholds: { maxScore: 20, passingScore: 30 } },
    { ...DEFAULT_RULES, rounding: { mode: 'NONE', scale: 7 } },
    { ...DEFAULT_RULES, assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { EXAM: -1 } } },
    { ...DEFAULT_RULES, assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { UNKNOWN: 10 } } },
    { ...DEFAULT_RULES, requiredAssessments: { types: ['EXAM', 'EXAM'] } },
    { ...DEFAULT_RULES, subjectCoefficients: { math: 7 } },
  ])
    expect(configurationCreate.safeParse({ name: 'Invalid', rules }).success).toBe(false);
  expect(
    activationErrors(
      configurationRules.parse({
        ...DEFAULT_RULES,
        periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
      }),
    ),
  ).not.toHaveLength(0);
  expect(
    activationErrors(
      configurationRules.parse({
        ...DEFAULT_RULES,
        annualCalculation: { mode: 'WEIGHTED_AVERAGE' },
      }),
    ),
  ).not.toHaveLength(0);
  expect(
    activationErrors(
      configurationRules.parse({
        ...DEFAULT_RULES,
        assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { EXAM: 0 } },
      }),
    ),
  ).not.toHaveLength(0);
  expect(
    activationErrors(
      configurationRules.parse({
        ...DEFAULT_RULES,
        assessmentWeighting: { mode: 'WEIGHTED', weightsByType: { EXAM: 50 } },
      }),
    ),
  ).toEqual([]);
});
