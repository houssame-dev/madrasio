import { safeDeploymentError } from './contracts';
import { waitForProductionDeployment } from './production-release-transport';

waitForProductionDeployment(process.env)
  .then((result) =>
    console.info(JSON.stringify({ event: 'production_exact_sha_ready', ...result })),
  )
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'production_release_wait_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
