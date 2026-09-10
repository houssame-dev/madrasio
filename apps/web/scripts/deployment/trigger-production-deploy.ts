import { safeDeploymentError } from './contracts';
import {
  saveProductionReleaseMarker,
  triggerProductionDeployHook,
} from './production-release-transport';

triggerProductionDeployHook(process.env)
  .then(async (marker) => {
    await saveProductionReleaseMarker(process.env, marker);
    console.info(
      JSON.stringify({
        event: 'production_deploy_hook_accepted',
        hookJobId: marker.hookJobId,
        hookCreatedAt: marker.hookCreatedAt,
      }),
    );
  })
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'production_deploy_hook_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
