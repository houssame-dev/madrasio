import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { boundedFileBytes, FileError, MAX_FILE_BYTES } from '@/lib/files/policy';
import { R2PrivateFileStore } from '@/lib/files/storage';
import * as service from '@/lib/modules/announcements/application/announcement-attachments';
import { toApiErrorResponse } from './errors';

type Context = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const store = new R2PrivateFileStore(); // Lazy configuration: no provider/build-time I/O.
async function scope(request: Request, context: Context) {
  const db = getDb(); const current = await requireCurrentContext(db);
  if (new URL(request.url).search) throw new FileError('FILE_INVALID');
  const parameters = await context.params;
  const parsed = z.record(uuid).safeParse(parameters);
  if (!parsed.success || !parameters.id) throw new FileError('FILE_INVALID');
  return { db, actor: { userId: current.userId, schoolId: current.schoolContext!.schoolId }, p: parsed.data };
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) {
    const response = toApiErrorResponse(error);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  }
}
function json(data: unknown, status = 200) { return Response.json({ data }, { status, headers: { 'cache-control': 'private, no-store' } }); }
function attachmentResponse(result: { bytes: Uint8Array; name: string }) {
  const encoded = encodeURIComponent(result.name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(result.bytes).buffer, { headers: {
    'content-type': 'application/octet-stream', 'content-length': String(result.bytes.length),
    'content-disposition': `attachment; filename="attachment"; filename*=UTF-8''${encoded}`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
    'referrer-policy': 'no-referrer',
  } });
}
export function managedAttachmentsGET(request: Request, context: Context) {
  return run(async () => { const { db, actor, p } = await scope(request, context); return json(await service.listManagedAttachments(db, actor, p.id!, p.versionId!)); });
}
export function managedAttachmentsPOST(request: Request, context: Context) {
  return run(async () => {
    const { db, actor, p } = await scope(request, context);
    await service.requireAttachmentManagement(db, actor, p.id!, p.versionId!, true);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new FileError('FILE_INVALID');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) throw new FileError('FILE_INVALID');
    const requestId = uuid.safeParse(request.headers.get('idempotency-key'));
    if (!requestId.success) throw new FileError('FILE_INVALID');
    let name: string;
    try { name = decodeURIComponent(request.headers.get('x-file-name') ?? ''); } catch { throw new FileError('FILE_INVALID'); }
    const bytes = await boundedFileBytes(request.body);
    return json(await service.uploadAnnouncementAttachment(db, store, actor, p.id!, p.versionId!, {
      requestId: requestId.data, name, mediaType: request.headers.get('content-type') ?? '', bytes,
    }), 201);
  });
}
export function managedAttachmentDELETE(request: Request, context: Context) {
  return run(async () => { const { db, actor, p } = await scope(request, context); return json(await service.removeAnnouncementAttachment(db, actor, p.id!, p.versionId!, p.attachmentId!)); });
}
export function managedAttachmentDownloadGET(request: Request, context: Context) {
  return run(async () => { const { db, actor, p } = await scope(request, context); return attachmentResponse(await service.downloadManagedAttachment(db, store, actor, p.id!, p.versionId!, p.attachmentId!)); });
}
export function recipientAttachmentsGET(request: Request, context: Context) {
  return run(async () => { const { db, actor, p } = await scope(request, context); return json(await service.listRecipientAttachments(db, actor, p.id!)); });
}
export function recipientAttachmentDownloadGET(request: Request, context: Context) {
  return run(async () => { const { db, actor, p } = await scope(request, context); return attachmentResponse(await service.downloadRecipientAttachment(db, store, actor, p.id!, p.attachmentId!)); });
}
