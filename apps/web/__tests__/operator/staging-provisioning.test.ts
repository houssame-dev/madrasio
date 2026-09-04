// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  parseBootstrapConfig,
  parseSeedConfig,
  type AuthAdminPort,
  type BootstrapStorePort,
  type DemoSeedStorePort,
  type SafeLogger,
} from '@/scripts/operator/contracts';
import { runFirstTenantBootstrap, runStagingDemoSeed } from '@/scripts/operator/orchestration';
import { DEMO_GRADING_RULES, verifyHostedHttpPreflight } from '@/scripts/operator/runtime';
import {
  computeAnnualResult,
  computePeriodResult,
  computeSubjectResult,
} from '@/lib/modules/grades/domain/calculation/engine';

const adminId = '00000000-0000-4000-8000-000000000001';
const teacherId = '00000000-0000-4000-8000-000000000002';
const parentId = '00000000-0000-4000-8000-000000000003';
const schoolId = '00000000-0000-4000-8000-000000000004';
const adminPassword = 'Task042-admin-password';
const serviceSecret = 'task042-service-secret';

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    BOOTSTRAP_TARGET_ENV: 'staging',
    BOOTSTRAP_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
    SUPABASE_URL: 'https://cqeaxlttezunirsmkrxz.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
    SUPABASE_SECRET_KEY: serviceSecret,
    DATABASE_URL:
      'postgresql://postgres.cqeaxlttezunirsmkrxz:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    MIGRATION_DATABASE_URL:
      'postgresql://postgres.cqeaxlttezunirsmkrxz:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@staging.example',
    BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
    BOOTSTRAP_SCHOOL_NAME: 'STAGING School',
    BOOTSTRAP_SCHOOL_TIMEZONE: 'Africa/Casablanca',
    STAGING_TEACHER_EMAIL: 'teacher@staging.example',
    STAGING_TEACHER_PASSWORD: 'Task042-teacher-password',
    STAGING_PARENT_EMAIL: 'parent@staging.example',
    STAGING_PARENT_PASSWORD: 'Task042-parent-password',
  };
}

function logger(): SafeLogger & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    info(event, details) {
      entries.push({ event, ...details });
    },
    error(event, details) {
      entries.push({ event, ...details });
    },
  };
}

function auth(overrides: Partial<AuthAdminPort> = {}): AuthAdminPort {
  return {
    listUsers: vi.fn().mockResolvedValue([]),
    createUser: vi.fn().mockResolvedValue({ id: adminId, email: 'admin@staging.example' }),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function store(overrides: Partial<BootstrapStorePort> = {}): BootstrapStorePort {
  return {
    inspect: vi.fn().mockResolvedValue({ kind: 'empty' }),
    create: vi.fn().mockResolvedValue({ schoolId }),
    ...overrides,
  };
}

describe('Task 042 operator configuration guards', () => {
  it('refuses a missing environment designation', () => {
    const env = validEnv();
    delete env.BOOTSTRAP_TARGET_ENV;
    expect(() => parseBootstrapConfig(env)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPERATOR_INPUT' }),
    );
  });

  it('refuses a project-ref mismatch', () => {
    const env = validEnv();
    env.BOOTSTRAP_EXPECTED_PROJECT_REF = 'differentprojectref';
    expect(() => parseBootstrapConfig(env)).toThrowError(
      expect.objectContaining({ code: 'STAGING_TARGET_NOT_CONFIRMED' }),
    );
  });

  it('refuses Production demo seed with no bypass', () => {
    const env = validEnv();
    env.BOOTSTRAP_TARGET_ENV = 'production';
    expect(() => parseSeedConfig(env)).toThrowError(
      expect.objectContaining({ code: 'PRODUCTION_SEED_REFUSED' }),
    );
  });

  it('validates operator email, password, and school inputs without reporting values', () => {
    const env = validEnv();
    env.BOOTSTRAP_ADMIN_EMAIL = 'not-an-email';
    env.BOOTSTRAP_ADMIN_PASSWORD = 'short';
    env.BOOTSTRAP_SCHOOL_NAME = '';
    expect(() => parseBootstrapConfig(env)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_OPERATOR_INPUT',
        message: expect.not.stringContaining('short'),
      }),
    );
  });

  it('rejects a browser-exposed operator credential', () => {
    const env = validEnv();
    env.NEXT_PUBLIC_SUPABASE_SECRET_KEY = serviceSecret;
    expect(() => parseBootstrapConfig(env)).toThrowError(
      expect.objectContaining({ code: 'BROWSER_OPERATOR_SECRET_REJECTED' }),
    );
  });

  it('does not accept retired API-key aliases without the modern keys', () => {
    const env = validEnv();
    delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete env.SUPABASE_SECRET_KEY;
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'retired-public-fixture';
    env.SUPABASE_SERVICE_ROLE_KEY = 'retired-elevated-fixture';
    expect(() => parseBootstrapConfig(env)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPERATOR_INPUT' }),
    );
  });
});

describe('hosted Auth and Data API semantic preflight', () => {
  const config = parseBootstrapConfig(validEnv());
  const authSettings = () =>
    new Response(JSON.stringify({ disable_signup: true, external: { anonymous: false } }), {
      status: 200,
    });

  it('accepts a non-successful normal table request without requiring one gateway status', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authSettings())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Access to schema is forbidden' }), { status: 401 }),
      );
    await expect(verifyHostedHttpPreflight(config, request)).resolves.toBeUndefined();
    expect(request.mock.calls[1][0]).toContain('/rest/v1/schools?select=id&limit=1');
  });

  it('stops when the public key is rejected as invalid', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 }));
    await expect(verifyHostedHttpPreflight(config, request)).rejects.toMatchObject({
      code: 'STAGING_PUBLIC_KEY_MISMATCH',
    });
  });

  it('stops when a normal application table is queryable', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authSettings())
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    await expect(verifyHostedHttpPreflight(config, request)).rejects.toMatchObject({
      code: 'DATA_API_UNEXPECTEDLY_AVAILABLE',
    });
  });
});

describe('first-tenant bootstrap orchestration', () => {
  const config = parseBootstrapConfig(validEnv());

  it('compensates only the newly created Auth identity when the DB transaction fails', async () => {
    const authPort = auth();
    const dbFailure = new Error('expected DB failure');
    await expect(
      runFirstTenantBootstrap(config, {
        auth: authPort,
        store: store({ create: vi.fn().mockRejectedValue(dbFailure) }),
        logger: logger(),
      }),
    ).rejects.toBe(dbFailure);
    expect(authPort.deleteUser).toHaveBeenCalledOnce();
    expect(authPort.deleteUser).toHaveBeenCalledWith(adminId);
  });

  it('never deletes a pre-existing Auth identity when state is partial', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([{ id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL }]),
    });
    await expect(
      runFirstTenantBootstrap(config, {
        auth: authPort,
        store: store({
          inspect: vi
            .fn()
            .mockResolvedValue({ kind: 'partial', reason: 'public.users is missing' }),
        }),
        logger: logger(),
      }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_PARTIAL_STATE' });
    expect(authPort.createUser).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
  });

  it('returns a controlled no-op for an exact completed rerun', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([{ id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL }]),
    });
    const storePort = store({ inspect: vi.fn().mockResolvedValue({ kind: 'complete', schoolId }) });
    await expect(
      runFirstTenantBootstrap(config, { auth: authPort, store: storePort, logger: logger() }),
    ).resolves.toEqual({ status: 'already-complete', schoolId, userId: adminId });
    expect(authPort.createUser).not.toHaveBeenCalled();
    expect(storePort.create).not.toHaveBeenCalled();
  });

  it('stops on ambiguous application state before creating Auth data', async () => {
    const authPort = auth();
    await expect(
      runFirstTenantBootstrap(config, {
        auth: authPort,
        store: store({
          inspect: vi
            .fn()
            .mockResolvedValue({ kind: 'partial', reason: 'unrelated tenant exists' }),
        }),
        logger: logger(),
      }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_PARTIAL_STATE' });
    expect(authPort.createUser).not.toHaveBeenCalled();
  });

  it('never logs password or service-secret values', async () => {
    const safeLogger = logger();
    await runFirstTenantBootstrap(config, { auth: auth(), store: store(), logger: safeLogger });
    const serialized = JSON.stringify(safeLogger.entries);
    expect(serialized).not.toContain(adminPassword);
    expect(serialized).not.toContain(serviceSecret);
  });

  it('persists the canonical email returned by Auth Admin', async () => {
    const storePort = store();
    const authPort = auth({
      createUser: vi.fn().mockResolvedValue({ id: adminId, email: ' Admin@Staging.Example ' }),
    });
    await runFirstTenantBootstrap(config, {
      auth: authPort,
      store: storePort,
      logger: logger(),
    });
    expect(storePort.create).toHaveBeenCalledWith({
      authUserId: adminId,
      authUserEmail: 'admin@staging.example',
      schoolName: config.BOOTSTRAP_SCHOOL_NAME,
      timezone: config.BOOTSTRAP_SCHOOL_TIMEZONE,
    });
  });
});

describe('staging demo seed orchestration', () => {
  const config = parseSeedConfig(validEnv());

  function seedStore(overrides: Partial<DemoSeedStorePort> = {}): DemoSeedStorePort {
    return {
      inspect: vi.fn().mockResolvedValue({ kind: 'empty', schoolId }),
      create: vi.fn().mockResolvedValue(undefined),
      reconcileGradingFixture: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('uses grading rules supported by every V1 result calculation stage', () => {
    const subject = computeSubjectResult({
      assessments: [
        { id: 'quiz', assessmentType: 'QUIZ', maximumScore: '20.00', weight: '1.00' },
        { id: 'exam', assessmentType: 'EXAM', maximumScore: '20.00', weight: '1.00' },
      ],
      grades: [
        { assessmentId: 'quiz', score: '14.00', state: 'VALID' },
        { assessmentId: 'exam', score: '18.00', state: 'VALID' },
      ],
      coefficient: '2.00',
      rules: DEMO_GRADING_RULES,
    });
    const period = computePeriodResult({
      subjectResults: [
        { subjectId: 'math', coefficient: '2.00', value: '16.00' },
        { subjectId: 'french', coefficient: '1.00', value: '13.00' },
      ],
      rules: DEMO_GRADING_RULES,
    });
    const annual = computeAnnualResult({
      periodResults: [
        { academicPeriodId: 'term-one', value: '15.00' },
        { academicPeriodId: 'term-two', value: '17.00' },
      ],
      rules: DEMO_GRADING_RULES,
    });

    expect(subject.status).toBe('complete');
    expect(period.status).toBe('complete');
    expect(annual.status).toBe('complete');
  });

  it('reconciles only the exact legacy grading state and verifies the successor', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([
        { id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL },
        { id: teacherId, email: config.STAGING_TEACHER_EMAIL },
        { id: parentId, email: config.STAGING_PARENT_EMAIL },
      ]),
    });
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'reconcilable', schoolId })
      .mockResolvedValueOnce({ kind: 'complete', schoolId });
    const storePort = seedStore({ inspect });

    await expect(
      runStagingDemoSeed(config, { auth: authPort, store: storePort, logger: logger() }),
    ).resolves.toEqual({ status: 'reconciled', schoolId });
    expect(storePort.reconcileGradingFixture).toHaveBeenCalledOnce();
    expect(storePort.reconcileGradingFixture).toHaveBeenCalledWith(schoolId);
    expect(storePort.create).not.toHaveBeenCalled();
    expect(authPort.createUser).not.toHaveBeenCalled();
  });

  it('treats an exact reconciled rerun as a no-op without another version', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([
        { id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL },
        { id: teacherId, email: config.STAGING_TEACHER_EMAIL },
        { id: parentId, email: config.STAGING_PARENT_EMAIL },
      ]),
    });
    const storePort = seedStore({
      inspect: vi.fn().mockResolvedValue({ kind: 'complete', schoolId }),
    });

    await expect(
      runStagingDemoSeed(config, { auth: authPort, store: storePort, logger: logger() }),
    ).resolves.toEqual({ status: 'already-complete', schoolId });
    expect(storePort.reconcileGradingFixture).not.toHaveBeenCalled();
    expect(storePort.create).not.toHaveBeenCalled();
  });

  it('compensates both newly created test identities when the seed transaction fails', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([{ id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL }]),
      createUser: vi
        .fn()
        .mockResolvedValueOnce({ id: teacherId, email: config.STAGING_TEACHER_EMAIL })
        .mockResolvedValueOnce({ id: parentId, email: config.STAGING_PARENT_EMAIL }),
    });
    await expect(
      runStagingDemoSeed(config, {
        auth: authPort,
        store: seedStore({ create: vi.fn().mockRejectedValue(new Error('seed DB failure')) }),
        logger: logger(),
      }),
    ).rejects.toThrow('seed DB failure');
    expect(authPort.deleteUser).toHaveBeenNthCalledWith(1, parentId);
    expect(authPort.deleteUser).toHaveBeenNthCalledWith(2, teacherId);
  });

  it('does not adopt or delete a pre-existing test identity in partial state', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([
        { id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL },
        { id: teacherId, email: config.STAGING_TEACHER_EMAIL },
      ]),
    });
    await expect(
      runStagingDemoSeed(config, {
        auth: authPort,
        store: seedStore(),
        logger: logger(),
      }),
    ).rejects.toMatchObject({ code: 'DEMO_SEED_PARTIAL_STATE' });
    expect(authPort.deleteUser).not.toHaveBeenCalled();
  });

  it('passes canonical Auth-returned Teacher and Parent emails to the seed transaction', async () => {
    const authPort = auth({
      listUsers: vi.fn().mockResolvedValue([{ id: adminId, email: config.BOOTSTRAP_ADMIN_EMAIL }]),
      createUser: vi
        .fn()
        .mockResolvedValueOnce({ id: teacherId, email: ' Teacher@Staging.Example ' })
        .mockResolvedValueOnce({ id: parentId, email: ' Parent@Staging.Example ' }),
    });
    const storePort = seedStore();
    await runStagingDemoSeed(config, { auth: authPort, store: storePort, logger: logger() });
    expect(storePort.create).toHaveBeenCalledWith({
      schoolId,
      teacherUser: { id: teacherId, email: 'teacher@staging.example' },
      parentUser: { id: parentId, email: 'parent@staging.example' },
    });
  });
});
