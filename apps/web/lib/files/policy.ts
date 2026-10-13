import { createHash } from 'node:crypto';
import { AppError } from '@/lib/errors';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_VERSION_ATTACHMENTS = 10;
export type FileErrorCode = 'FILE_INVALID' | 'FILE_UNAVAILABLE' | 'FILE_VERSION_FROZEN' | 'FILE_LIMIT_REACHED'
  | 'FILE_REQUEST_CONFLICT' | 'FILE_RECONCILIATION_REQUIRED' | 'FILE_STORAGE_UNAVAILABLE' | 'FILE_NOT_READY';
const messages: Record<FileErrorCode, string> = {
  FILE_INVALID: 'Choose a nonempty PDF, PNG or JPEG up to 2 MiB with a simple filename.',
  FILE_UNAVAILABLE: 'Attachment is unavailable.', FILE_VERSION_FROZEN: 'Attachments can only change on the latest never-scheduled Version.',
  FILE_LIMIT_REACHED: 'This resource supports at most ten attachment intents.', FILE_REQUEST_CONFLICT: 'Upload request conflicts with an earlier request.',
  FILE_RECONCILIATION_REQUIRED: 'Upload could not be completed safely. Refresh attachments and contact an operator before retrying.',
  FILE_STORAGE_UNAVAILABLE: 'Private file storage is unavailable.', FILE_NOT_READY: 'Resolve incomplete attachments before continuing.',
};
export class FileError extends AppError {
  constructor(public readonly featureCode: FileErrorCode) {
    super(featureCode === 'FILE_UNAVAILABLE' ? 'NOT_FOUND' : 'BUSINESS_RULE_VIOLATION', messages[featureCode]);
  }
}
export function fileDigest(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }

/** Conservative identification, not malware scanning or a complete document decoder. Never serve inline. */
export function validateFile(input: { name: string; mediaType: string; bytes: Uint8Array }) {
  const { name, mediaType, bytes } = input;
  if (!name || name !== name.trim() || name.length > 180 || /[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/u.test(name)
    || name === '.' || name === '..' || bytes.length === 0 || bytes.length > MAX_FILE_BYTES) throw new FileError('FILE_INVALID');
  const signature = Buffer.from(bytes.subarray(0, 8));
  const valid = mediaType === 'application/pdf' && /\.pdf$/i.test(name) && signature.subarray(0, 5).equals(Buffer.from('%PDF-'))
    || mediaType === 'image/png' && /\.png$/i.test(name) && signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || mediaType === 'image/jpeg' && /\.jpe?g$/i.test(name) && signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  if (!valid) throw new FileError('FILE_INVALID');
  return { originalName: name, mediaType, byteSize: bytes.length, sha256: fileDigest(bytes) };
}

/** Bound both browser uploads and object downloads; never buffer an unbounded stream. */
export async function boundedFileBytes(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!body) throw new FileError('FILE_INVALID');
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) { await reader.cancel(); throw new FileError('FILE_INVALID'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
