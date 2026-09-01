// @vitest-environment node

import { authUsers } from 'drizzle-orm/supabase';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { createGradesTestDb, type GradesTestDb } from '@/__tests__/grades/test-helpers';
import {
  DEMO_GRADING_RULES,
  DEMO_IDS,
  DemoSeedStore,
  LEGACY_DEMO_GRADING_RULES,
} from '@/scripts/operator/runtime';

describe('legacy STAGING grading fixture reconciliation', () => {
  let testDb: GradesTestDb | undefined;

  afterEach(async () => {
    await testDb?.client.close();
  });

  it('preserves legacy rules and Gradebook binding while creating one idempotent successor', async () => {
    testDb = await createGradesTestDb();
    const adminUserId = randomUUID();
    const teacherUserId = randomUUID();
    const parentUserId = randomUUID();
    const schoolId = randomUUID();
    await testDb.seed.insert(authUsers).values([
      { id: adminUserId, email: `${adminUserId}@test.example` },
      { id: teacherUserId, email: `${teacherUserId}@test.example` },
      { id: parentUserId, email: `${parentUserId}@test.example` },
    ]);
    await testDb.seed.insert(schema.users).values({
      id: adminUserId,
      email: `${adminUserId}@test.example`,
    });
    await testDb.seed.insert(schema.schools).values({ id: schoolId, name: 'STAGING School' });
    await testDb.seed.insert(schema.schoolMemberships).values({
      schoolId,
      userId: adminUserId,
      role: 'SCHOOL_ADMIN',
      status: 'ACTIVE',
    });
    const store = new DemoSeedStore(testDb.seed as never);
    await store.create({
      schoolId,
      teacherUser: { id: teacherUserId, email: `${teacherUserId}@test.example` },
      parentUser: { id: parentUserId, email: `${parentUserId}@test.example` },
    });
    await testDb.seed
      .update(schema.gradingConfigurationVersions)
      .set({ rules: LEGACY_DEMO_GRADING_RULES })
      .where(eq(schema.gradingConfigurationVersions.id, DEMO_IDS.gradingVersion));
    const historicalGradebookId = randomUUID();
    await testDb.seed.insert(schema.gradebooks).values({
      id: historicalGradebookId,
      schoolId,
      academicYearId: DEMO_IDS.academicYear,
      academicPeriodId: DEMO_IDS.periodOne,
      classId: DEMO_IDS.class,
      subjectId: DEMO_IDS.subjectMath,
      gradingConfigurationVersionId: DEMO_IDS.gradingVersion,
      status: 'OPEN',
    });

    await expect(store.inspect({
      adminUser: { id: adminUserId, email: `${adminUserId}@test.example` },
      teacherUser: { id: teacherUserId, email: `${teacherUserId}@test.example` },
      parentUser: { id: parentUserId, email: `${parentUserId}@test.example` },
      schoolName: 'STAGING School',
    })).resolves.toEqual({ kind: 'reconcilable', schoolId });

    await store.reconcileGradingFixture(schoolId);
    await store.reconcileGradingFixture(schoolId);

    const versions = await testDb.seed
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(
        schema.gradingConfigurationVersions.gradingConfigurationId,
        DEMO_IDS.gradingConfiguration,
      ));
    expect(versions).toHaveLength(2);
    expect(versions.find((row) => row.id === DEMO_IDS.gradingVersion)).toMatchObject({
      versionNumber: 1,
      status: 'ARCHIVED',
      rules: LEGACY_DEMO_GRADING_RULES,
    });
    expect(versions.find((row) => row.id === DEMO_IDS.gradingVersionSuccessor)).toMatchObject({
      versionNumber: 2,
      status: 'ACTIVE',
      rules: DEMO_GRADING_RULES,
    });
    const [gradebook] = await testDb.seed
      .select({ versionId: schema.gradebooks.gradingConfigurationVersionId })
      .from(schema.gradebooks)
      .where(eq(schema.gradebooks.id, historicalGradebookId));
    expect(gradebook.versionId).toBe(DEMO_IDS.gradingVersion);
    await expect(store.inspect({
      adminUser: { id: adminUserId, email: `${adminUserId}@test.example` },
      teacherUser: { id: teacherUserId, email: `${teacherUserId}@test.example` },
      parentUser: { id: parentUserId, email: `${parentUserId}@test.example` },
      schoolName: 'STAGING School',
    })).resolves.toEqual({ kind: 'complete', schoolId });
  });
});
