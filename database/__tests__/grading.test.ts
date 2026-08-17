import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

let db: Db;

const VALID_RULES = {
  schemaVersion: 1,
  periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: {
    mode: 'WEIGHTED',
    weightsByType: { EXAM: 60, CONTINUOUS_ASSESSMENT: 40 },
  },
  coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
  requiredAssessments: { types: ['EXAM'] },
};

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createConfiguration(schoolId: string, name: string) {
  const [config] = await db
    .insert(schema.gradingConfigurations)
    .values({ schoolId, name })
    .returning();
  return config;
}

async function createVersion(
  schoolId: string,
  configurationId: string,
  versionNumber: number,
  rules: Record<string, unknown> = VALID_RULES,
) {
  const [version] = await db
    .insert(schema.gradingConfigurationVersions)
    .values({ schoolId, gradingConfigurationId: configurationId, versionNumber, rules })
    .returning();
  return version;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('grading_configurations (Task 006A §21)', () => {
  it('belongs to exactly one School', async () => {
    const school = await createSchool('School A');

    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    expect(config.schoolId).toBe(school.id);
    expect(config.status).toBe('ACTIVE');
  });

  it('rejects a duplicate configuration identity within the same School', async () => {
    const school = await createSchool('School A');
    await createConfiguration(school.id, 'Standard Secondary Grading');

    await expect(createConfiguration(school.id, 'Standard Secondary Grading')).rejects.toThrow();
  });

  it('allows the same configuration name in another School', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');

    const a = await createConfiguration(schoolA.id, 'Primary Evaluation Rules');
    const b = await createConfiguration(schoolB.id, 'Primary Evaluation Rules');

    expect(a.schoolId).toBe(schoolA.id);
    expect(b.schoolId).toBe(schoolB.id);
  });

  it('supports a lifecycle status (ACTIVE → INACTIVE → ARCHIVED)', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'BAC Grading');

    const [inactive] = await db
      .update(schema.gradingConfigurations)
      .set({ status: 'INACTIVE' })
      .where(eq(schema.gradingConfigurations.id, config.id))
      .returning();
    expect(inactive.status).toBe('INACTIVE');

    const [archived] = await db
      .update(schema.gradingConfigurations)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurations.id, config.id))
      .returning();
    expect(archived.status).toBe('ARCHIVED');
  });

  it('is not deletable while versions exist (RESTRICT)', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');
    await createVersion(school.id, config.id, 1);

    await expect(
      db.delete(schema.gradingConfigurations).where(eq(schema.gradingConfigurations.id, config.id)),
    ).rejects.toThrow();
  });
});

describe('grading_configuration_versions (Task 006A §21)', () => {
  it('belongs to a GradingConfiguration', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    const version = await createVersion(school.id, config.id, 1);

    expect(version.gradingConfigurationId).toBe(config.id);
    expect(version.schoolId).toBe(school.id);
    expect(version.versionNumber).toBe(1);
    expect(version.status).toBe('DRAFT');
  });

  it('rejects a duplicate version number within the same Configuration', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');
    await createVersion(school.id, config.id, 1);

    await expect(createVersion(school.id, config.id, 1)).rejects.toThrow();
  });

  it('allows the same version number under different Configurations', async () => {
    const school = await createSchool('School A');
    const configA = await createConfiguration(school.id, 'Primary Evaluation Rules');
    const configB = await createConfiguration(school.id, 'BAC Grading');

    const vA = await createVersion(school.id, configA.id, 1);
    const vB = await createVersion(school.id, configB.id, 1);

    expect(vA.gradingConfigurationId).toBe(configA.id);
    expect(vB.gradingConfigurationId).toBe(configB.id);
  });

  it('rejects a non-positive version number', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    await expect(createVersion(school.id, config.id, 0)).rejects.toThrow();
    await expect(createVersion(school.id, config.id, -1)).rejects.toThrow();
  });

  it('cannot belong to another School’s Configuration (cross-tenant safety)', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const configA = await createConfiguration(schoolA.id, 'Primary Evaluation Rules');

    await expect(createVersion(schoolB.id, configA.id, 1)).rejects.toThrow();
  });

  it('supports the DRAFT → ACTIVE → ARCHIVED version lifecycle', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');
    const version = await createVersion(school.id, config.id, 1);

    const [active] = await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, version.id))
      .returning();
    expect(active.status).toBe('ACTIVE');

    const [archived] = await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, version.id))
      .returning();
    expect(archived.status).toBe('ARCHIVED');
  });

  it('accepts a well-formed rules payload (valid JSON object)', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    const version = await createVersion(school.id, config.id, 1);

    expect(version.rules).toEqual(VALID_RULES);
  });

  it('rejects an invalid (non-object) rules payload', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    await expect(createVersion(school.id, config.id, 1, 'not-an-object' as never)).rejects.toThrow();
    await expect(createVersion(school.id, config.id, 1, [1, 2, 3] as never)).rejects.toThrow();
  });

  it('rejects a NULL rules payload', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    await expect(createVersion(school.id, config.id, 1, null as never)).rejects.toThrow();
  });

  it('represents decimal/numeric configuration values safely', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'BAC Grading');

    const version = await createVersion(school.id, config.id, 1, {
      schemaVersion: 1,
      thresholds: { maxScore: 20, passingScore: 10.5 },
    });

    const score = (version.rules as { thresholds: { passingScore: unknown } }).thresholds.passingScore;
    expect(typeof score).toBe('number');
    expect(score).toBe(10.5);
  });

  it('deleting a version does not silently destroy the configuration or other versions', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');
    const v1 = await createVersion(school.id, config.id, 1);
    const v2 = await createVersion(school.id, config.id, 2);

    await db
      .delete(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    const remainingVersions = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.gradingConfigurationId, config.id));
    expect(remainingVersions.map((v) => v.id)).toEqual([v2.id]);

    const configs = await db
      .select()
      .from(schema.gradingConfigurations)
      .where(eq(schema.gradingConfigurations.id, config.id));
    expect(configs).toHaveLength(1);
  });
});

describe('one ACTIVE version per Configuration (Task 006A.1)', () => {
  it('allows the first ACTIVE version', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, (await createVersion(school.id, config.id, 1)).id));

    const versions = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.gradingConfigurationId, config.id));
    expect(versions.filter((v) => v.status === 'ACTIVE')).toHaveLength(1);
  });

  it('rejects a second ACTIVE version for the same Configuration', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');
    const v1 = await createVersion(school.id, config.id, 1);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    await expect(
      db
        .insert(schema.gradingConfigurationVersions)
        .values({ schoolId: school.id, gradingConfigurationId: config.id, versionNumber: 2, status: 'ACTIVE', rules: VALID_RULES }),
    ).rejects.toThrow();

    const v2 = await createVersion(school.id, config.id, 2);
    await expect(
      db
        .update(schema.gradingConfigurationVersions)
        .set({ status: 'ACTIVE' })
        .where(eq(schema.gradingConfigurationVersions.id, v2.id)),
    ).rejects.toThrow();
  });

  it('allows an ACTIVE version for another Configuration (not school-wide)', async () => {
    const school = await createSchool('School A');
    const configA = await createConfiguration(school.id, 'Primary Evaluation Rules');
    const configB = await createConfiguration(school.id, 'BAC Grading');

    const vA = await createVersion(school.id, configA.id, 1);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, vA.id));

    const vB = await createVersion(school.id, configB.id, 1);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, vB.id));

    const active = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.status, 'ACTIVE'));
    expect(active.map((v) => v.gradingConfigurationId).sort()).toEqual([configA.id, configB.id].sort());
  });

  it('does not make DRAFT/ARCHIVED versions conflict with the ACTIVE version', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    const v1 = await createVersion(school.id, config.id, 1);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    const v2 = await createVersion(school.id, config.id, 2);
    expect(v2.status).toBe('DRAFT');

    const v3 = await db
      .insert(schema.gradingConfigurationVersions)
      .values({ schoolId: school.id, gradingConfigurationId: config.id, versionNumber: 3, status: 'ARCHIVED', rules: VALID_RULES })
      .returning();
    expect(v3[0].status).toBe('ARCHIVED');

    const versions = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.gradingConfigurationId, config.id));
    expect(versions.filter((v) => v.status === 'ACTIVE')).toHaveLength(1);
    expect(versions).toHaveLength(3);
  });

  it('allows activating a new version after archiving the current one', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    const v1 = await createVersion(school.id, config.id, 1);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    const v2 = await createVersion(school.id, config.id, 2);
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v2.id));

    const active = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.status, 'ACTIVE'));
    expect(active.map((v) => v.id)).toEqual([v2.id]);
  });
});

describe('historical safety (Task 006A §22, BR-GRADE-013)', () => {
  it('changing the current version never mutates a historical version', async () => {
    const school = await createSchool('School A');
    const config = await createConfiguration(school.id, 'Standard Secondary Grading');

    // Version 1 — used for historical calculations (now archived).
    const v1 = await createVersion(school.id, config.id, 1, {
      schemaVersion: 1,
      thresholds: { maxScore: 20, passingScore: 10 },
      rounding: { mode: 'HALF_UP', scale: 2 },
    });
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    // Version 2 — new/current configuration.
    const v2 = await createVersion(school.id, config.id, 2, {
      schemaVersion: 1,
      thresholds: { maxScore: 20, passingScore: 12 },
      rounding: { mode: 'HALF_EVEN', scale: 2 },
    });
    await db
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.gradingConfigurationVersions.id, v2.id));

    const historical = await db
      .select()
      .from(schema.gradingConfigurationVersions)
      .where(eq(schema.gradingConfigurationVersions.id, v1.id));

    expect(historical).toHaveLength(1);
    expect(historical[0].status).toBe('ARCHIVED');
    expect(historical[0].rules).toEqual({
      schemaVersion: 1,
      thresholds: { maxScore: 20, passingScore: 10 },
      rounding: { mode: 'HALF_UP', scale: 2 },
    });
  });
});