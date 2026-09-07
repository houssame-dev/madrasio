import { safeDeploymentError } from './contracts';
import { triggerProductionDeployHook } from './production-release-transport';

triggerProductionDeployHook(process.env)
  .then(() => console.info(JSON.stringify({ event: 'production_deploy_hook_accepted' })))
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'production_deploy_hook_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
