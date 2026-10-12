import 'server-only';
import { signR2Request, type R2SigningConfiguration } from '@/lib/storage/r2-signing';
import { boundedFileBytes, fileDigest, FileError } from './policy';

export interface PrivateFileStore {
  put(key: string, bytes: Uint8Array, sha256: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export function applicationStorageConfiguration(env: NodeJS.ProcessEnv): R2SigningConfiguration {
  try {
    const account = env.R2_ACCOUNT_ID ?? ''; const bucket = env.R2_BUCKET ?? '';
    const endpoint = new URL(env.R2_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`);
    if (!/^[a-f0-9]{32}$/.test(account) || endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
      || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
      || ![`${account}.r2.cloudflarestorage.com`, `${account}.eu.r2.cloudflarestorage.com`].includes(endpoint.hostname)
      || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || /backup|recovery/i.test(bucket)
      || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error();
    return { endpoint, bucket, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY };
  } catch { throw new FileError('FILE_STORAGE_UNAVAILABLE'); }
}

/** Lazy, server-only. No public URLs, ACL grants, redirects, provider errors or automatic retries. */
export class R2PrivateFileStore implements PrivateFileStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly fetchImpl: typeof fetch = fetch) {}
  private async request(method: 'PUT' | 'GET' | 'DELETE', key: string, bytes?: Uint8Array, digest?: string) {
    try {
      if (!/^application-files\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key)) throw new Error();
      const signed = signR2Request(applicationStorageConfiguration(this.env), method, key, digest ?? fileDigest(new Uint8Array()),
        method === 'PUT' ? { 'if-none-match': '*', 'content-type': 'application/octet-stream', 'content-length': String(bytes!.length), 'x-amz-meta-sha256': digest! } : {});
      const response = await this.fetchImpl(signed.url, { method, headers: signed.headers,
        ...(bytes ? { body: new Uint8Array(bytes).buffer } : {}), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      return response;
    } catch { throw new FileError('FILE_STORAGE_UNAVAILABLE'); }
  }
  async put(key: string, bytes: Uint8Array, digest: string) { const response = await this.request('PUT', key, bytes, digest); await response.body?.cancel(); }
  async get(key: string) {
    try { return await boundedFileBytes((await this.request('GET', key)).body); }
    catch { throw new FileError('FILE_STORAGE_UNAVAILABLE'); }
  }
  async delete(key: string) { const response = await this.request('DELETE', key); await response.body?.cancel(); }
}
