import { consoleLogger, OperatorError, parseProductionBootstrapConfig } from './contracts';
import { runFirstTenantBootstrap } from './orchestration';
import { createOperatorRuntime } from './runtime';

async function main(): Promise<void> {
  const config = parseProductionBootstrapConfig(process.env);
  const runtime = createOperatorRuntime(config);
  try {
    consoleLogger.info('production_bootstrap_preflight_started', { target: 'production' });
    await runtime.preflight();
    consoleLogger.info('production_bootstrap_preflight_passed', {
      migrationCount: 16,
      applicationTableCount: 39,
    });
    const result = await runFirstTenantBootstrap(config, {
      auth: runtime.auth,
      store: runtime.bootstrapStore,
      logger: consoleLogger,
    });
    await runtime.verifyPasswordLogin(
      config.BOOTSTRAP_ADMIN_EMAIL,
      config.BOOTSTRAP_ADMIN_PASSWORD,
      result.userId,
    );
    consoleLogger.info('production_bootstrap_login_verified', {
      schoolId: result.schoolId,
      userId: result.userId,
      status: result.status,
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
