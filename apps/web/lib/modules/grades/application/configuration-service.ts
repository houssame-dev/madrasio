import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { and, count, desc, eq } from 'drizzle-orm';
import * as s from '@school/database';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { recordGradingAudit } from '@/lib/audit/grading';
import type { AuditTransaction } from '@/lib/audit/repository';
import type { GradebooksDb } from '../infrastructure/repositories/gradebook-repository';
import type { GradebookActor } from './gradebook-service';
import { isUniqueViolation } from './gradebook-errors';
import {
  activationErrors,
  configurationCreate,
  configurationPage,
  configurationRules,
  configurationStatus,
  versionCreate,
  versionPatch,
} from '../domain/configuration-contracts';

export class ConfigurationError extends AppError {
  constructor(
    readonly featureCode:
      | 'GRADING_CONFIGURATION_LOCKED'
      | 'GRADING_CONFIGURATION_STATE'
      | 'GRADING_CONFIGURATION_DUPLICATE',
    message: string,
  ) {
    super('CONFLICT', message);
  }
}
const manage = (db: GradebooksDb, actor: GradebookActor) =>
  requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'grades.manage',
    scope: { kind: 'school' },
  });
const configWhere = (schoolId: string, id: string) =>
  and(eq(s.gradingConfigurations.schoolId, schoolId), eq(s.gradingConfigurations.id, id));
async function find(db: GradebooksDb, actor: GradebookActor, id: string, lock = false) {
  const query = db.select().from(s.gradingConfigurations).where(configWhere(actor.schoolId, id));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new NotFoundError();
  return row;
}
function active(status: string) {
  if (status !== 'ACTIVE')
    throw new ConfigurationError(
      'GRADING_CONFIGURATION_STATE',
      'An active configuration is required.',
    );
}
/** A full version UPDATE lock precedes this separate READ COMMITTED statement.
 * Immediate referencing FKs conflict with that lock, including independent Result references.
 */
async function used(db: GradebooksDb, schoolId: string, versionId: string) {
  for (const table of [
    s.gradebooks,
    s.subjectResults,
    s.periodResults,
    s.annualResults,
    s.resultPublications,
  ]) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.schoolId, schoolId), eq(table.gradingConfigurationVersionId, versionId)))
      .limit(1);
    if (rows.length) return true;
  }
  return false;
}
export async function listConfigurations(db: GradebooksDb, actor: GradebookActor, page = 1) {
  await manage(db, actor);
  const parsed = configurationPage.safeParse(page);
  if (!parsed.success) throw new ValidationError('Invalid page.');
  const condition = eq(s.gradingConfigurations.schoolId, actor.schoolId);
  const data = await db
    .select()
    .from(s.gradingConfigurations)
    .where(condition)
    .orderBy(s.gradingConfigurations.name, s.gradingConfigurations.id)
    .limit(50)
    .offset((page - 1) * 50);
  const [total] = await db
    .select({ value: count() })
    .from(s.gradingConfigurations)
    .where(condition);
  return { data, meta: { page, pageSize: 50, total: total.value } };
}
export async function getConfiguration(db: GradebooksDb, actor: GradebookActor, id: string) {
  await manage(db, actor);
  const configuration = await find(db, actor, id);
  const rows = await db
    .select()
    .from(s.gradingConfigurationVersions)
    .where(
      and(
        eq(s.gradingConfigurationVersions.schoolId, actor.schoolId),
        eq(s.gradingConfigurationVersions.gradingConfigurationId, id),
      ),
    )
    .orderBy(desc(s.gradingConfigurationVersions.versionNumber));
  const versions = await Promise.all(
    rows.map(async (row) => {
      const hasHistory = await used(db, actor.schoolId, row.id);
      return {
        ...row,
        hasHistory,
        editable: configuration.status === 'ACTIVE' && row.status === 'DRAFT' && !hasHistory,
      };
    }),
  );
  return { ...configuration, versions };
}
async function insertVersion(
  db: AuditTransaction,
  actor: GradebookActor,
  configurationId: string,
  rules: unknown,
) {
  const [last] = await db
    .select({ number: s.gradingConfigurationVersions.versionNumber })
    .from(s.gradingConfigurationVersions)
    .where(eq(s.gradingConfigurationVersions.gradingConfigurationId, configurationId))
    .orderBy(desc(s.gradingConfigurationVersions.versionNumber))
    .limit(1);
  const [version] = await db
    .insert(s.gradingConfigurationVersions)
    .values({
      schoolId: actor.schoolId,
      gradingConfigurationId: configurationId,
      versionNumber: (last?.number ?? 0) + 1,
      rules,
      status: 'DRAFT',
    })
    .returning();
  await recordGradingAudit(db, actor, {
    action: 'GradingConfigurationVersionCreated',
    resourceId: version.id,
    metadata: { configurationId, versionNumber: version.versionNumber },
  });
  return version;
}
export async function createConfiguration(db: GradebooksDb, actor: GradebookActor, input: unknown) {
  await manage(db, actor);
  const parsed = configurationCreate.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid grading configuration.');
  try {
    return await db.transaction(async (tx) => {
      await manage(tx, actor);
      const [row] = await tx
        .insert(s.gradingConfigurations)
        .values({ schoolId: actor.schoolId, name: parsed.data.name })
        .returning();
      await recordGradingAudit(tx, actor, {
        action: 'GradingConfigurationCreated',
        resourceId: row.id,
        metadata: { configurationId: row.id },
      });
      await insertVersion(tx, actor, row.id, parsed.data.rules);
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConfigurationError(
        'GRADING_CONFIGURATION_DUPLICATE',
        'This configuration name already exists in the School.',
      );
    throw error;
  }
}
export async function createVersion(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  input: unknown,
) {
  await manage(db, actor);
  const parsed = versionCreate.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid grading rules.');
  return db.transaction(async (tx) => {
    await manage(tx, actor);
    active((await find(tx, actor, id, true)).status);
    return insertVersion(tx, actor, id, parsed.data.rules);
  });
}
export async function setConfigurationStatus(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  input: unknown,
) {
  await manage(db, actor);
  const parsed = configurationStatus.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid configuration status.');
  return db.transaction(async (tx) => {
    await manage(tx, actor);
    const row = await find(tx, actor, id, true);
    if (row.status === parsed.data.status) return row;
    if (row.status === 'ARCHIVED')
      throw new ConfigurationError(
        'GRADING_CONFIGURATION_STATE',
        'Archived configurations are retained for history.',
      );
    const [updated] = await tx
      .update(s.gradingConfigurations)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(configWhere(actor.schoolId, id))
      .returning();
    await recordGradingAudit(tx, actor, {
      action: 'GradingConfigurationStatusChanged',
      resourceId: id,
      metadata: { configurationId: id, previousStatus: row.status, newStatus: updated.status },
    });
    return updated;
  });
}
export async function patchVersion(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  versionId: string,
  input: unknown,
) {
  await manage(db, actor);
  const parsed = versionPatch.safeParse(input);
  if (!parsed.success) throw new ValidationError('Provide grading rules or a version transition.');
  return db.transaction(
    async (tx) => {
      await manage(tx, actor);
      active((await find(tx, actor, id, true)).status);
      const condition = and(
        eq(s.gradingConfigurationVersions.schoolId, actor.schoolId),
        eq(s.gradingConfigurationVersions.gradingConfigurationId, id),
        eq(s.gradingConfigurationVersions.id, versionId),
      );
      const [row] = await tx
        .select()
        .from(s.gradingConfigurationVersions)
        .where(condition)
        .for('update');
      if (!row) throw new NotFoundError();
      const change = parsed.data;
      if ('rules' in change) {
        if (row.status !== 'DRAFT' || (await used(tx, actor.schoolId, versionId)))
          throw new ConfigurationError(
            'GRADING_CONFIGURATION_LOCKED',
            'Rules are retained to preserve academic history. Create a new version.',
          );
        if (isDeepStrictEqual(row.rules, change.rules)) return row;
        const [updated] = await tx
          .update(s.gradingConfigurationVersions)
          .set({ rules: change.rules, updatedAt: new Date() })
          .where(condition)
          .returning();
        await recordGradingAudit(tx, actor, {
          action: 'GradingConfigurationRulesChanged',
          resourceId: versionId,
          metadata: { configurationId: id, versionNumber: row.versionNumber },
        });
        return updated;
      }
      if (row.status === change.status) return row;
      if (row.status === 'ARCHIVED')
        throw new ConfigurationError(
          'GRADING_CONFIGURATION_LOCKED',
          'Archived versions cannot be reactivated. Create a new version.',
        );
      if (change.status === 'ACTIVE') {
        const rules = configurationRules.safeParse(row.rules);
        if (!rules.success || activationErrors(rules.data).length)
          throw new ValidationError('Complete valid calculation settings before activation.');
        const prior = await tx
          .select()
          .from(s.gradingConfigurationVersions)
          .where(
            and(
              eq(s.gradingConfigurationVersions.gradingConfigurationId, id),
              eq(s.gradingConfigurationVersions.status, 'ACTIVE'),
            ),
          )
          .for('update');
        for (const previous of prior) {
          await tx
            .update(s.gradingConfigurationVersions)
            .set({ status: 'ARCHIVED', updatedAt: new Date() })
            .where(eq(s.gradingConfigurationVersions.id, previous.id));
          await recordGradingAudit(tx, actor, {
            action: 'GradingConfigurationVersionStatusChanged',
            resourceId: previous.id,
            metadata: {
              configurationId: id,
              versionNumber: previous.versionNumber,
              previousStatus: 'ACTIVE',
              newStatus: 'ARCHIVED',
            },
          });
        }
      }
      const [updated] = await tx
        .update(s.gradingConfigurationVersions)
        .set({ status: change.status, updatedAt: new Date() })
        .where(condition)
        .returning();
      await recordGradingAudit(tx, actor, {
        action: 'GradingConfigurationVersionStatusChanged',
        resourceId: versionId,
        metadata: {
          configurationId: id,
          versionNumber: row.versionNumber,
          previousStatus: row.status,
          newStatus: change.status,
        },
      });
      return updated;
    },
    { isolationLevel: 'read committed' },
  );
}
