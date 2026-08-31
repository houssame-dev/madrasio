import { consoleLogger, OperatorError, parseSeedConfig } from './contracts';
import { runStagingDemoSeed } from './orchestration';
import { createOperatorRuntime } from './runtime';

async function main(): Promise<void> {
  const config = parseSeedConfig(process.env);
  const runtime = createOperatorRuntime(config);
  try {
    consoleLogger.info('demo_seed_preflight_started', { target: 'staging' });
    await runtime.preflight();
    consoleLogger.info('demo_seed_preflight_passed', {
      migrationCount: 14,
      applicationTableCount: 39,
    });
    const result = await runStagingDemoSeed(config, {
      auth: runtime.auth,
      store: runtime.demoSeedStore,
      logger: consoleLogger,
    });
    const users = await runtime.auth.listUsers();
    const teacher = users.find(
      (user) => user.email.toLowerCase() === config.STAGING_TEACHER_EMAIL.toLowerCase(),
    );
    const parent = users.find(
      (user) => user.email.toLowerCase() === config.STAGING_PARENT_EMAIL.toLowerCase(),
    );
    if (!teacher || !parent)
      throw new OperatorError(
        'DEMO_SEED_VERIFICATION_FAILED',
        'Expected test Auth identities were not found.',
      );
    await runtime.verifyPasswordLogin(
      config.STAGING_TEACHER_EMAIL,
      config.STAGING_TEACHER_PASSWORD,
      teacher.id,
    );
    await runtime.verifyPasswordLogin(
      config.STAGING_PARENT_EMAIL,
      config.STAGING_PARENT_PASSWORD,
      parent.id,
    );
    consoleLogger.info('demo_seed_login_verified', {
      schoolId: result.schoolId,
      status: result.status,
      teacherUserId: teacher.id,
      parentUserId: parent.id,
    });
  } finally {
    await runtime.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof OperatorError) {
    consoleLogger.error(error.code, { message: error.message });
  } else {
    consoleLogger.error('UNEXPECTED_OPERATOR_FAILURE');
  }
  process.exitCode = 1;
});
