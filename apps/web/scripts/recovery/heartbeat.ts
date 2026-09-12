import { RecoveryError } from './contracts';
import type { RecoveryHeartbeat } from './operations';

type Fetch = typeof fetch;

function parseHeartbeatUrl(value: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(value ?? 'invalid:');
  } catch {
    url = new URL('invalid:');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'cronitor.link' ||
    url.username ||
    url.password ||
    !/^\/p\/[A-Za-z0-9_-]+\/madrasio-production-backup$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new RecoveryError('BACKUP_HEARTBEAT_FAILED', 'The backup heartbeat target is invalid.');
  }
  return url;
}

export class CronitorRecoveryHeartbeat implements RecoveryHeartbeat {
  private readonly url: URL;

  constructor(
    value: string | undefined,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.url = parseHeartbeatUrl(value);
  }

  private async send(state?: 'fail'): Promise<void> {
    const target = new URL(this.url);
    target.searchParams.set('env', 'production');
    if (state) target.searchParams.set('state', state);
    const response = await this.fetchImpl(target, { method: 'POST', redirect: 'error' });
    if (!response.ok) {
      throw new RecoveryError('BACKUP_HEARTBEAT_FAILED', 'Backup monitoring telemetry failed.');
    }
  }

  async success(_input: {
    backupId: string;
    ciphertextSha256: string;
    completedAt: string;
  }): Promise<void> {
    await this.send();
  }

  async failure(_input: { code: string; failedAt: string }): Promise<void> {
    await this.send('fail');
  }
}
