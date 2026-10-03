/** ADR-022: dispatch only. Backup/recovery success is determined in GitHub, not here. */
export const EXPECTED_CRON = '23 0,2,4,6,8,10,12,14,16,18,20,22 * * *';

export interface SchedulerEnv {
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_OWNER: string;
  GITHUB_REPOSITORY: string;
  GITHUB_WORKFLOW: string;
  BACKUP_CANDIDATE_SHA: string;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Web Crypto imports PKCS#8; GitHub App downloads commonly contain PKCS#1 RSA PEM.
// Wrap that DER unchanged in the standard rsaEncryption PrivateKeyInfo envelope.
function der(tag: number, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const length: number[] = [];
  for (let n = bytes.length; n > 0; n >>>= 8) length.unshift(n & 255);
  return new Uint8Array([
    tag,
    ...(bytes.length < 128 ? [bytes.length] : [128 | length.length, ...length]),
    ...bytes,
  ]);
}

function privateKeyDer(pem: string): Uint8Array<ArrayBuffer> {
  if (typeof pem !== 'string' || pem.length > 16384) throw new Error('Invalid signing key.');
  const match = pem
    .trim()
    .match(
      /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s+([A-Za-z0-9+/=\r\n]+)\s+-----END \1-----$/,
    );
  if (!match) throw new Error('Invalid signing key.');
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), (c) => c.charCodeAt(0));
  if (match[1] === 'PRIVATE KEY') return bytes;
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  return der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...algorithm, ...der(0x04, bytes)]));
}

async function appJwt(env: SchedulerEnv): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer(env.GITHUB_APP_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048)
    throw new Error('Invalid signing key.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: env.GITHUB_APP_ID, iat: now - 60, exp: now + 540 })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

function validate(controller: ScheduledController, env: SchedulerEnv): string {
  if (controller.cron !== EXPECTED_CRON || !Number.isSafeInteger(controller.scheduledTime)) {
    throw new Error('Invalid schedule.');
  }
  if (
    ![
      env.GITHUB_APP_ID,
      env.GITHUB_INSTALLATION_ID,
      env.GITHUB_OWNER,
      env.GITHUB_REPOSITORY,
      env.GITHUB_WORKFLOW,
      env.BACKUP_CANDIDATE_SHA,
    ].every((value) => typeof value === 'string' && value.length > 0) ||
    !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_APP_ID) ||
    !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_INSTALLATION_ID) ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(env.GITHUB_OWNER) ||
    !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(env.GITHUB_REPOSITORY) ||
    env.GITHUB_WORKFLOW !== 'backup-production.yml' ||
    !/^[a-f0-9]{40}$/.test(env.BACKUP_CANDIDATE_SHA)
  ) {
    throw new Error('Invalid scheduler configuration.');
  }
  const timestamp = new Date(controller.scheduledTime).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    throw new Error('Invalid schedule.');
  }
  return timestamp;
}

async function post(path: string, authorization: string, body: unknown): Promise<Response> {
  // Redirects must not forward credentials; bounded single attempts, no response/error logging.
  const response = await fetch(`https://api.github.com${path}`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${authorization}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'madrasio-backup-scheduler',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status >= 300 && response.status < 400) throw new Error('Redirect rejected.');
  return response;
}

export default {
  async scheduled(controller: ScheduledController, env: SchedulerEnv): Promise<void> {
    controller.noRetry();
    try {
      const scheduledForUtc = validate(controller, env);
      const jwt = await appJwt(env);
      const response = await post(
        `/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
        jwt,
        {
          repositories: [env.GITHUB_REPOSITORY],
          permissions: { actions: 'write' },
        },
      );
      if (response.status !== 201) throw new Error('Installation rejected.');
      const installation = (await response.json()) as { token?: unknown; expires_at?: unknown };
      if (
        typeof installation.token !== 'string' ||
        !installation.token ||
        installation.token.length > 4096 ||
        typeof installation.expires_at !== 'string'
      )
        throw new Error('Invalid installation response.');
      const lifetime = Date.parse(installation.expires_at) - Date.now();
      if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 3_660_000)
        throw new Error('Invalid token lifetime.');
      // One dispatch only. Even a timeout after acceptance is not retried.
      const dispatch = await post(
        `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
        installation.token,
        {
          ref: 'main',
          inputs: {
            candidate_sha: env.BACKUP_CANDIDATE_SHA,
            confirmation: 'BACKUP_PRODUCTION',
            retention_class: 'frequent',
            trigger_source: 'cloudflare-cron-v1',
            scheduled_for_utc: scheduledForUtc,
          },
        },
      );
      if (!dispatch.ok) throw new Error('Dispatch rejected.');
      // Acceptance only: no success heartbeat and no claim of a verified recovery point.
    } catch {
      // Suppress provider bodies, crypto errors, URLs and credential-bearing exceptions.
      throw new Error('BACKUP_SCHEDULER_DISPATCH_NOT_CONFIRMED');
    }
  },
};
