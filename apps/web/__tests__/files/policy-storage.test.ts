import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { boundedFileBytes, fileDigest, MAX_FILE_BYTES, validateFile } from '@/lib/files/policy';
import { applicationStorageConfiguration, R2PrivateFileStore } from '@/lib/files/storage';
import { signR2Request } from '@/lib/storage/r2-signing';

const pdf = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
const upload = { name: 'notice.pdf', mediaType: 'application/pdf', bytes: pdf };
const env: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET: 'local-private-files',
  R2_ACCESS_KEY_ID: 'fixture-access',
  R2_SECRET_ACCESS_KEY: 'fixture-secret',
};
const key = `application-files/${randomUUID()}/${randomUUID()}`;

describe('private file policy', () => {
  it('accepts only identified, bounded V1 types and computes exact immutable metadata', () => {
    expect(validateFile(upload)).toEqual({ originalName: 'notice.pdf', mediaType: 'application/pdf', byteSize: pdf.length, sha256: fileDigest(pdf) });
    expect(validateFile({ name: 'image.PNG', mediaType: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }).mediaType).toBe('image/png');
    expect(validateFile({ name: 'image.jpeg', mediaType: 'image/jpeg', bytes: Buffer.from([255, 216, 255, 0]) }).mediaType).toBe('image/jpeg');
  });
  it.each(['../notice.pdf', '..\\notice.pdf', 'a\r\nb.pdf', 'a\u0000.pdf', 'a\u202e.pdf', 'x'.repeat(181), ' notice.pdf', 'notice.pdf '])('rejects unsafe presentation name %j', (name) => {
    expect(() => validateFile({ ...upload, name })).toThrow();
  });
  it.each([
    { ...upload, bytes: new Uint8Array() }, { ...upload, bytes: new Uint8Array(MAX_FILE_BYTES + 1) },
    { ...upload, bytes: Buffer.from('<script>alert(1)</script>') }, { ...upload, mediaType: 'text/html' },
    { ...upload, bytes: Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad]) },
    { ...upload, name: 'notice.exe' }, { ...upload, name: 'notice.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ])('rejects invalid content without trusting extension/MIME', (input) => { expect(() => validateFile(input)).toThrow(); });
  it('cancels oversized streams rather than allocating unlimited upload/download bodies', async () => {
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(MAX_FILE_BYTES)); c.enqueue(new Uint8Array(1)); }, cancel });
    await expect(boundedFileBytes(body)).rejects.toMatchObject({ featureCode: 'FILE_INVALID' }); expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('private R2 adapter (fake transport only)', () => {
  it('requires a separate application bucket and exact account/EU endpoint; no fallback backup target', () => {
    expect(applicationStorageConfiguration({ ...env, R2_ENDPOINT: `https://${env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com` }).endpoint.hostname).toContain('.eu.');
    for (const overrides of [{ R2_BUCKET: 'madrasio-production-backups' }, { R2_BUCKET: '' }, { R2_ENDPOINT: 'https://outside.example' }, { R2_ENDPOINT: `http://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` }, { R2_SECRET_ACCESS_KEY: '' }]) {
      expect(() => applicationStorageConfiguration({ ...env, ...overrides })).toThrow('Private file storage is unavailable.');
    }
  });
  it('conditionally writes once, never grants public ACLs, and returns no object URL', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const store = new R2PrivateFileStore(env, transport);
    await expect(store.put(key, pdf, fileDigest(pdf))).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledOnce();
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toContain('/local-private-files/application-files/');
    expect(init).toMatchObject({ method: 'PUT', redirect: 'error', cache: 'no-store', headers: { 'if-none-match': '*', 'content-type': 'application/octet-stream' } });
    expect(new Headers(init?.headers).has('x-amz-acl')).toBe(false);
  });
  it('maps provider errors without raw response, credentials or retry', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture-provider-sensitive-detail', { status: 403 }));
    await expect(new R2PrivateFileStore(env, transport).put(key, pdf, fileDigest(pdf))).rejects.toMatchObject({ featureCode: 'FILE_STORAGE_UNAVAILABLE', message: 'Private file storage is unavailable.' });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('rejects arbitrary storage paths before transport and verifies signed request determinism', async () => {
    const transport = vi.fn<typeof fetch>(); const store = new R2PrivateFileStore(env, transport);
    await expect(store.delete('../other-object')).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
    const config = applicationStorageConfiguration(env); const now = new Date('2026-01-01T00:00:00Z');
    const a = signR2Request(config, 'GET', key, fileDigest(new Uint8Array()), {}, now);
    expect(signR2Request(config, 'GET', key, fileDigest(new Uint8Array()), {}, now)).toEqual(a);
    expect(a.headers).not.toHaveProperty('host'); expect(a.url.search).toBe('');
  });
});
