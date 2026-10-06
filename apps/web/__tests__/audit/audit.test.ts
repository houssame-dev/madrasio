import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';
import {
  createAuthTestDb,
  seedSchool,
  seedUser,
  seedMembership,
  type AuthTestDb,
} from '../auth/test-helpers';
import * as academic from '@/lib/modules/academic-structure/application';
import type { AcademicStructureDb } from '@/lib/modules/academic-structure/infrastructure/repositories/academic-structure-repository';
import { readSchoolAudit, recordSchoolAudit } from '@/lib/audit/service';
import * as repository from '@/lib/audit/repository';
import { schoolAuditEventSchema } from '@/lib/audit/contracts';
import {
  classPatchSchema,
  curriculumVersionPatchSchema,
} from '@/lib/modules/academic-structure/domain';

let test: AuthTestDb;
let db: AcademicStructureDb;
beforeEach(async () => {
  test = await createAuthTestDb();
  db = test.seed as unknown as AcademicStructureDb;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test.client.close();
});
async function fixture() {
  const school = await seedSchool(test.seed);
  const userId = await seedUser(test.seed);
  await seedMembership(test.seed, userId, school.id, 'SCHOOL_ADMIN');
  const actor = { userId, schoolId: school.id };
  const curriculum = await academic.createCurriculum(db, actor, { name: 'Programme' });
  const version = await academic.createCurriculumVersion(db, actor, curriculum.id, { name: 'V1' });
  return { actor, curriculum, version };
}

it('attributes lifecycle changes, skips no-op/metadata edits, paginates and never rewrites history', async () => {
  const { actor, version } = await fixture();
  await academic.patchCurriculumVersion(db, actor, version.id, { name: 'Renamed' });
  expect((await readSchoolAudit(db, actor, { page: 1, pageSize: 10 })).data).toEqual([]);
  await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' });
  const first = (await readSchoolAudit(db, actor, { page: 1, pageSize: 10 })).data[0];
  expect(first).toMatchObject({
    action: 'CurriculumVersionStatusChanged',
    scope: 'SCHOOL',
    schoolId: actor.schoolId,
    actorKind: 'USER',
    actorUserId: actor.userId,
    systemActor: null,
    resourceType: 'CurriculumVersion',
    resourceId: version.id,
    metadata: { previousStatus: 'DRAFT', newStatus: 'ACTIVE' },
  });
  expect(first.occurredAt).toBeInstanceOf(Date);
  await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' });
  await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ARCHIVED' });
  const all = await readSchoolAudit(db, actor, { page: 1, pageSize: 10 });
  expect(all.meta.total).toBe(2);
  expect(all.data.find((row) => row.id === first.id)).toEqual(first);
  const one = await readSchoolAudit(db, actor, { page: 1, pageSize: 1 });
  const two = await readSchoolAudit(db, actor, { page: 2, pageSize: 1 });
  expect([one.data[0].id, two.data[0].id]).toEqual(all.data.map((row) => row.id));
});

it('rolls back lifecycle update and immediate activation creation on required audit failure', async () => {
  const { actor, curriculum, version } = await fixture();
  vi.spyOn(repository, 'appendAuditEvent').mockRejectedValue(
    new Error('sensitive raw SQL sentinel'),
  );
  const failure = await academic
    .patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' })
    .catch((error) => error);
  expect(failure).toMatchObject({
    code: 'INTERNAL_ERROR',
    featureCode: 'AUDIT_PERSISTENCE_FAILED',
  });
  expect(failure).not.toHaveProperty('cause');
  expect(JSON.stringify(failure)).not.toContain('sensitive raw SQL sentinel');
  expect((await academic.getCurriculumVersion(db, actor, version.id)).status).toBe('DRAFT');
  await expect(
    academic.createCurriculumVersion(db, actor, curriculum.id, {
      name: 'Direct activation',
      status: 'ACTIVE',
    }),
  ).rejects.toMatchObject({ featureCode: 'AUDIT_PERSISTENCE_FAILED' });
  expect(await test.seed.select().from(schema.curriculumVersions)).toHaveLength(1);
  expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
});

it('commits a Class correction and audit together, then rolls both back on failure', async () => {
  const { actor, curriculum, version } = await fixture();
  await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' });
  const next = await academic.createCurriculumVersion(db, actor, curriculum.id, {
    name: 'V2',
    status: 'ACTIVE',
  });
  const year = await academic.createAcademicYear(db, actor, {
    name: 'Year',
    startDate: '2026-09-01',
    endDate: '2027-07-01',
  });
  const stage = await academic.createStage(db, actor, { name: 'Stage', sequence: 1 });
  const level = await academic.createLevel(db, actor, {
    stageId: stage.id,
    name: 'Level',
    sequence: 1,
  });
  const klass = await academic.createClass(db, actor, {
    name: 'Class',
    academicYearId: year.id,
    levelId: level.id,
    curriculumVersionId: version.id,
  });
  await academic.patchClass(db, actor, klass.id, { curriculumVersionId: next.id });
  const [event] = await test.seed
    .select()
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.action, 'ClassCurriculumChanged'));
  expect(event).toMatchObject({
    actorUserId: actor.userId,
    schoolId: actor.schoolId,
    resourceType: 'Class',
    resourceId: klass.id,
    metadata: { previousVersionId: version.id, newVersionId: next.id },
  });
  vi.spyOn(repository, 'appendAuditEvent').mockRejectedValue(new Error('audit unavailable'));
  await expect(
    academic.patchClass(db, actor, klass.id, { curriculumVersionId: version.id }),
  ).rejects.toMatchObject({ featureCode: 'AUDIT_PERSISTENCE_FAILED' });
  expect((await academic.getClass(db, actor, klass.id)).curriculumVersionId).toBe(next.id);
  expect(
    await test.seed
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'ClassCurriculumChanged')),
  ).toEqual([event]);
});

it('requires active School authority for reads/writes without a platform bypass', async () => {
  const { actor, version } = await fixture();
  await academic.patchCurriculumVersion(db, actor, version.id, { status: 'ACTIVE' });
  const other = await seedSchool(test.seed, 'Other');
  const otherId = await seedUser(test.seed);
  await seedMembership(test.seed, otherId, other.id, 'SCHOOL_ADMIN');
  expect(
    (await readSchoolAudit(db, { userId: otherId, schoolId: other.id }, { page: 1, pageSize: 20 }))
      .data,
  ).toEqual([]);
  await expect(
    readSchoolAudit(db, { ...actor, schoolId: other.id }, { page: 1, pageSize: 20 }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  for (const role of ['TEACHER', 'PARENT', 'SUPER_ADMIN'] as const) {
    const userId = await seedUser(test.seed);
    if (role !== 'SUPER_ADMIN') await seedMembership(test.seed, userId, actor.schoolId, role);
    const input = { userId, schoolId: actor.schoolId };
    await expect(readSchoolAudit(db, input, { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      db.transaction((tx) =>
        recordSchoolAudit(tx, input, {
          action: 'CurriculumVersionStatusChanged',
          resourceId: version.id,
          metadata: { previousStatus: 'ACTIVE', newStatus: 'ARCHIVED' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  await expect(
    readSchoolAudit(db, { ...actor, userId: null }, { page: 1, pageSize: 20 }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(readSchoolAudit(db, actor, { page: 1, pageSize: 101 })).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  });
});

it('rejects spoofed context and secret/unbounded payloads rather than copying or logging them', async () => {
  const { actor, version } = await fixture();
  const event = {
    action: 'CurriculumVersionStatusChanged' as const,
    resourceId: version.id,
    metadata: { previousStatus: 'DRAFT' as const, newStatus: 'ACTIVE' as const },
  };
  for (const field of [
    'password',
    'token',
    'cookie',
    'authorization',
    'privateKey',
    'body',
    'actorUserId',
    'schoolId',
  ]) {
    expect(
      schoolAuditEventSchema.safeParse({
        ...event,
        metadata: { ...event.metadata, [field]: 'must-not-persist' },
      }).success,
    ).toBe(false);
    expect(schoolAuditEventSchema.safeParse({ ...event, [field]: actor.userId }).success).toBe(
      false,
    );
  }
  expect(classPatchSchema.safeParse({ name: 'Class', actorUserId: actor.userId }).success).toBe(
    false,
  );
  expect(
    curriculumVersionPatchSchema.safeParse({ status: 'ACTIVE', schoolId: actor.schoolId }).success,
  ).toBe(false);
  await expect(
    db.transaction((tx) =>
      recordSchoolAudit(tx, actor, {
        ...event,
        metadata: { ...event.metadata, password: 'synthetic' },
      } as typeof event),
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await test.seed.select().from(schema.auditEvents)).toHaveLength(0);
  expect(Object.keys(repository).sort()).toEqual(['appendAuditEvent', 'listSchoolAuditEvents']);
});
