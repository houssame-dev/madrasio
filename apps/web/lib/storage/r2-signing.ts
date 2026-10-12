import { createHash, createHmac } from 'node:crypto';

export interface R2SigningConfiguration { endpoint: URL; bucket: string; accessKeyId: string; secretAccessKey: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string): Buffer => createHmac('sha256', key).update(value).digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Shared private S3/R2 transport primitive. Callers own configuration, authorization and lifecycle. */
export function signR2Request(config: R2SigningConfiguration, method: 'GET' | 'HEAD' | 'PUT' | 'DELETE',
  key: string, payloadSha256: string, extraHeaders: Record<string, string> = {}, now = new Date()) {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = config;
  const path = `/${encode(bucket)}/${key.split('/').map(encode).join('/')}`;
  const instant = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const date = instant.slice(0, 8);
  const headers: Record<string, string> = { host: endpoint.host, 'x-amz-content-sha256': payloadSha256, 'x-amz-date': instant,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v.trim()])) };
  const names = Object.keys(headers).sort(); const signed = names.join(';');
  const request = [method, path, '', names.map((n) => `${n}:${headers[n]}\n`).join(''), signed, payloadSha256].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${createHmac('sha256', signingKey).update(['AWS4-HMAC-SHA256', instant, scope, hash(request)].join('\n')).digest('hex')}`;
  delete headers.host;
  return { url: new URL(path, endpoint), headers };
}
