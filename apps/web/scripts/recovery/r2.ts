import { createHash } from 'node:crypto';
import { signR2Request } from '../../lib/storage/r2-signing';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { RecoveryError } from './contracts';
import type { EncryptedBackupObject, RecoveryObjectStore } from './operations';

type Fetch = typeof fetch;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertR2Configuration(env: NodeJS.ProcessEnv) {
  const endpoint = new URL(env.R2_ENDPOINT ?? 'invalid:');
  const bucket = env.R2_BUCKET_NAME?.trim() ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    throw new RecoveryError('BACKUP_UPLOAD_FAILED', 'The reviewed private R2 target is required.');
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

export class R2RecoveryObjectStore implements RecoveryObjectStore {
  private readonly configuration;

  constructor(
    env: NodeJS.ProcessEnv,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.configuration = assertR2Configuration(env);
  }

  private signedHeaders(
    method: 'GET' | 'HEAD' | 'PUT',
    key: string,
    payloadSha256: string,
    extraHeaders: Record<string, string> = {},
  ): { url: URL; headers: Record<string, string> } {
    return signR2Request(this.configuration, method, key, payloadSha256, extraHeaders, this.now());
  }

  async putImmutable(input: EncryptedBackupObject & { bodyPath: string }): Promise<void> {
    const signed = this.signedHeaders('PUT', input.key, input.sha256, {
      'content-length': String(input.bytes),
      'content-type': 'application/octet-stream',
      'if-none-match': '*',
      'x-amz-meta-sha256': input.sha256,
    });
    const response = await this.fetchImpl(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: createReadStream(input.bodyPath) as never,
      duplex: 'half',
      redirect: 'error',
    } as RequestInit & { duplex: 'half' });
    if (!response.ok) {
      throw new RecoveryError('BACKUP_UPLOAD_FAILED', 'Immutable R2 upload was rejected.');
    }
  }

  async head(key: string): Promise<EncryptedBackupObject | null> {
    const signed = this.signedHeaders('HEAD', key, sha256(''));
    const response = await this.fetchImpl(signed.url, {
      method: 'HEAD',
      headers: signed.headers,
      redirect: 'error',
    });
    if (response.status === 404) return null;
    const bytes = Number(response.headers.get('content-length'));
    const checksum = response.headers.get('x-amz-meta-sha256') ?? '';
    if (
      !response.ok ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(checksum)
    ) {
      throw new RecoveryError('BACKUP_REMOTE_VERIFICATION_FAILED', 'R2 metadata readback failed.');
    }
    return { key, bytes, sha256: checksum };
  }

  async download(key: string, destination: string): Promise<void> {
    const signed = this.signedHeaders('GET', key, sha256(''));
    const response = await this.fetchImpl(signed.url, {
      method: 'GET',
      headers: signed.headers,
      redirect: 'error',
    });
    if (!response.ok || !response.body) {
      throw new RecoveryError(
        'BACKUP_REMOTE_VERIFICATION_FAILED',
        'R2 ciphertext readback failed.',
      );
    }
    await pipeline(response.body as never, createWriteStream(destination, { mode: 0o600 }));
  }
}
