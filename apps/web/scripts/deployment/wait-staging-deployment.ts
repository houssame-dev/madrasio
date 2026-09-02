import { safeDeploymentError } from './contracts';
import { waitForDeployment } from './release-transport';

waitForDeployment(process.env)
  .then((result) => {
    console.info(JSON.stringify({ event: 'staging_exact_sha_ready', ...result }));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'staging_release_wait_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
