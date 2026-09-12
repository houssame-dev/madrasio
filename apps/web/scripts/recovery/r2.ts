import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { RecoveryError } from './contracts';
import type { EncryptedBackupObject, RecoveryObjectStore } from './operations';

type Fetch = typeof fetch;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function objectPath(bucket: string, key: string): string {
  return `/${encodeSegment(bucket)}/${key.split('/').map(encodeSegment).join('/')}`;
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
    const { endpoint, bucket, accessKeyId, secretAccessKey } = this.configuration;
    const path = objectPath(bucket, key);
    const url = new URL(path, endpoint);
    const instant = this.now()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '');
    const date = instant.slice(0, 8);
    const headers: Record<string, string> = {
      host: endpoint.host,
      'x-amz-content-sha256': payloadSha256,
      'x-amz-date': instant,
      ...Object.fromEntries(
        Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), value.trim()]),
      ),
    };
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
    const signed = names.join(';');
    const request = [method, path, '', canonicalHeaders, signed, payloadSha256].join('\n');
    const scope = `${date}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', instant, scope, sha256(request)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), 'auto'), 's3'),
      'aws4_request',
    );
    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, ` +
      `Signature=${createHmac('sha256', signingKey).update(toSign).digest('hex')}`;
    delete headers.host;
    return { url, headers };
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
