import { safeDeploymentError } from './contracts';
import {
  loadProductionReleaseMarker,
  saveProductionReleaseMarker,
  waitForProductionDeployment,
} from './production-release-transport';

loadProductionReleaseMarker(process.env)
  .then((marker) => waitForProductionDeployment(process.env, marker))
  .then(async (result) => {
    await saveProductionReleaseMarker(process.env, result.marker);
    console.info(
      JSON.stringify({
        event: 'production_release_instance_ready',
        commitSha: result.commitSha,
        deploymentUrl: result.deploymentUrl,
        attempts: result.attempts,
      }),
    );
  })
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'production_release_wait_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
