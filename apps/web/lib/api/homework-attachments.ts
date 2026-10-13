import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { boundedFileBytes, FileError, MAX_FILE_BYTES } from '@/lib/files/policy';
import { R2PrivateFileStore } from '@/lib/files/storage';
import { requireSubmissionAttachmentAccess } from '@/lib/modules/homework/application/homework-service';
import * as service from '@/lib/modules/homework/application/submission-attachments';
import { toApiErrorResponse } from './errors';

type Context = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const store = new R2PrivateFileStore(); // Lazy; no configuration or provider I/O at build time.
async function scope(request: Request, context: Context) {
  const db = getDb(); const current = await requireCurrentContext(db);
  if (new URL(request.url).search) throw new FileError('FILE_INVALID');
  const parsed = z.record(uuid).safeParse(await context.params);
  if (!parsed.success || !parsed.data.id) throw new FileError('FILE_INVALID');
  return { db, actor: { userId: current.userId, schoolId: current.schoolContext!.schoolId }, p: parsed.data };
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) {
    const response = toApiErrorResponse(error);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  }
}
function json(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: { 'cache-control': 'private, no-store' } });
}
export function attachmentsGET(request: Request, context: Context) {
  return run(async () => {
    const { db, actor, p } = await scope(request, context);
    return json(await service.listSubmissionAttachments(db, actor, p.id!));
  });
}
export function attachmentsPOST(request: Request, context: Context) {
  return run(async () => {
    const { db, actor, p } = await scope(request, context);
    // Authorization precedes body consumption and storage interaction.
    await requireSubmissionAttachmentAccess(db, actor, p.id!, true);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new FileError('FILE_INVALID');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) throw new FileError('FILE_INVALID');
    const requestId = uuid.safeParse(request.headers.get('idempotency-key'));
    if (!requestId.success) throw new FileError('FILE_INVALID');
    let name: string;
    try { name = decodeURIComponent(request.headers.get('x-file-name') ?? ''); } catch { throw new FileError('FILE_INVALID'); }
    const bytes = await boundedFileBytes(request.body);
    return json(await service.uploadSubmissionAttachment(db, store, actor, p.id!, {
      requestId: requestId.data, name, mediaType: request.headers.get('content-type') ?? '', bytes,
    }), 201);
  });
}
export function attachmentDownloadGET(request: Request, context: Context) {
  return run(async () => {
    const { db, actor, p } = await scope(request, context);
    if (!p.attachmentId) throw new FileError('FILE_INVALID');
    const result = await service.downloadSubmissionAttachment(db, store, actor, p.id!, p.attachmentId);
    const encoded = encodeURIComponent(result.name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(result.bytes).buffer, { headers: {
      'content-type': 'application/octet-stream', 'content-length': String(result.bytes.length),
      'content-disposition': `attachment; filename="attachment"; filename*=UTF-8''${encoded}`,
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox", 'referrer-policy': 'no-referrer',
    } });
  });
}
