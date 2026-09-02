import { safeDeploymentError } from './contracts';
import { triggerDeployHook } from './release-transport';

triggerDeployHook(process.env)
  .then(() => {
    console.info(JSON.stringify({ event: 'staging_deploy_hook_accepted' }));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({ event: 'staging_deploy_hook_failed', ...safeDeploymentError(error) }),
    );
    process.exitCode = 1;
  });
