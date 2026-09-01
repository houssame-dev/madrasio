import type {
  AuthAdminPort,
  AuthIdentity,
  BootstrapConfig,
  BootstrapStorePort,
  DemoSeedStorePort,
  SafeLogger,
  SeedConfig,
} from './contracts';
import { OperatorError } from './contracts';
import { normalizeEmail } from '@/lib/auth/email';

function exactUser(users: AuthIdentity[], email: string): AuthIdentity | null {
  const normalized = normalizeEmail(email);
  const matches = users.filter((user) => normalizeEmail(user.email) === normalized);
  if (matches.length > 1)
    throw new OperatorError(
      'AMBIGUOUS_AUTH_IDENTITY',
      'Multiple Auth identities use the intended email.',
    );
  return matches[0] ?? null;
}

async function compensate(auth: AuthAdminPort, ids: string[], logger: SafeLogger): Promise<void> {
  const failed: string[] = [];
  for (const id of [...ids].reverse()) {
    try {
      await auth.deleteUser(id);
    } catch {
      failed.push(id);
    }
  }
  if (failed.length > 0) {
    logger.error('auth_compensation_failed', { count: failed.length });
    throw new OperatorError(
      'BOOTSTRAP_COMPENSATION_REQUIRED',
      `Operator reconciliation is required for newly-created Auth identity record(s): ${failed.join(', ')}.`,
    );
  }
  logger.info('auth_compensation_complete', { count: ids.length });
}

export async function runFirstTenantBootstrap(
  config: BootstrapConfig,
  deps: { auth: AuthAdminPort; store: BootstrapStorePort; logger: SafeLogger },
): Promise<{ status: 'created' | 'already-complete'; schoolId: string; userId: string }> {
  const users = await deps.auth.listUsers();
  const existing = exactUser(users, config.BOOTSTRAP_ADMIN_EMAIL);
  const state = await deps.store.inspect(existing, {
    schoolName: config.BOOTSTRAP_SCHOOL_NAME,
    timezone: config.BOOTSTRAP_SCHOOL_TIMEZONE,
  });

  if (state.kind === 'complete' && existing) {
    deps.logger.info('bootstrap_already_complete', {
      schoolId: state.schoolId,
      userId: existing.id,
    });
    return { status: 'already-complete', schoolId: state.schoolId, userId: existing.id };
  }
  if (state.kind !== 'empty' || existing || users.length > 0) {
    throw new OperatorError(
      'BOOTSTRAP_PARTIAL_STATE',
      state.kind === 'partial'
        ? state.reason
        : 'Auth or application data exists without an exact complete bootstrap.',
    );
  }

  const created = await deps.auth.createUser({
    email: config.BOOTSTRAP_ADMIN_EMAIL,
    password: config.BOOTSTRAP_ADMIN_PASSWORD,
  });
  if (normalizeEmail(created.email) !== normalizeEmail(config.BOOTSTRAP_ADMIN_EMAIL)) {
    await compensate(deps.auth, [created.id], deps.logger);
    throw new OperatorError(
      'AUTH_IDENTITY_EMAIL_MISMATCH',
      'The created Auth identity did not return the expected canonical email.',
    );
  }
  try {
    const result = await deps.store.create({
      authUserId: created.id,
      authUserEmail: normalizeEmail(created.email),
      schoolName: config.BOOTSTRAP_SCHOOL_NAME,
      timezone: config.BOOTSTRAP_SCHOOL_TIMEZONE,
    });
    deps.logger.info('bootstrap_created', { schoolId: result.schoolId, userId: created.id });
    return { status: 'created', schoolId: result.schoolId, userId: created.id };
  } catch (error) {
    await compensate(deps.auth, [created.id], deps.logger);
    throw error;
  }
}

export async function runStagingDemoSeed(
  config: SeedConfig,
  deps: { auth: AuthAdminPort; store: DemoSeedStorePort; logger: SafeLogger },
): Promise<{ status: 'created' | 'reconciled' | 'already-complete'; schoolId: string }> {
  const users = await deps.auth.listUsers();
  const admin = exactUser(users, config.BOOTSTRAP_ADMIN_EMAIL);
  const teacher = exactUser(users, config.STAGING_TEACHER_EMAIL);
  const parent = exactUser(users, config.STAGING_PARENT_EMAIL);
  const state = await deps.store.inspect({
    adminUser: admin,
    teacherUser: teacher,
    parentUser: parent,
    schoolName: config.BOOTSTRAP_SCHOOL_NAME,
  });

  if (state.kind === 'complete' && admin && teacher && parent) {
    deps.logger.info('demo_seed_already_complete', { schoolId: state.schoolId });
    return { status: 'already-complete', schoolId: state.schoolId };
  }
  if (state.kind === 'reconcilable' && admin && teacher && parent) {
    await deps.store.reconcileGradingFixture(state.schoolId);
    const verified = await deps.store.inspect({
      adminUser: admin,
      teacherUser: teacher,
      parentUser: parent,
      schoolName: config.BOOTSTRAP_SCHOOL_NAME,
    });
    if (verified.kind !== 'complete') {
      throw new OperatorError(
        'DEMO_SEED_RECONCILIATION_FAILED',
        'The deterministic grading fixture reconciliation did not reach the exact complete state.',
      );
    }
    deps.logger.info('demo_seed_grading_reconciled', { schoolId: state.schoolId });
    return { status: 'reconciled', schoolId: state.schoolId };
  }
  if (state.kind !== 'empty' || !admin || teacher || parent) {
    throw new OperatorError(
      'DEMO_SEED_PARTIAL_STATE',
      state.kind === 'partial'
        ? state.reason
        : 'Demo Auth/application state is not an exact fresh or complete seed.',
    );
  }

  const createdIds: string[] = [];
  try {
    const createdTeacher = await deps.auth.createUser({
      email: config.STAGING_TEACHER_EMAIL,
      password: config.STAGING_TEACHER_PASSWORD,
    });
    if (normalizeEmail(createdTeacher.email) !== normalizeEmail(config.STAGING_TEACHER_EMAIL)) {
      await compensate(deps.auth, [createdTeacher.id], deps.logger);
      throw new OperatorError(
        'AUTH_IDENTITY_EMAIL_MISMATCH',
        'The created Teacher Auth identity did not return the expected canonical email.',
      );
    }
    createdIds.push(createdTeacher.id);
    const createdParent = await deps.auth.createUser({
      email: config.STAGING_PARENT_EMAIL,
      password: config.STAGING_PARENT_PASSWORD,
    });
    createdIds.push(createdParent.id);
    if (normalizeEmail(createdParent.email) !== normalizeEmail(config.STAGING_PARENT_EMAIL)) {
      throw new OperatorError(
        'AUTH_IDENTITY_EMAIL_MISMATCH',
        'The created Parent Auth identity did not return the expected canonical email.',
      );
    }
    await deps.store.create({
      schoolId: state.schoolId,
      teacherUser: { ...createdTeacher, email: normalizeEmail(createdTeacher.email) },
      parentUser: { ...createdParent, email: normalizeEmail(createdParent.email) },
    });
    deps.logger.info('demo_seed_created', { schoolId: state.schoolId, fixtureSet: 'task-042-v1' });
    return { status: 'created', schoolId: state.schoolId };
  } catch (error) {
    if (createdIds.length > 0) await compensate(deps.auth, createdIds, deps.logger);
    throw error;
  }
}
