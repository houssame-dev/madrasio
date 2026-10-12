'use client';
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { useAppContext } from '@/components/app/app-context';
import { ConfirmDialog } from '@/components/academic/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';

interface Attachment { id: string; name: string; mediaType: string; byteSize: number; state: 'READY' | 'UPLOADING' | 'REJECTED' }
type Props = { announcementId: string; versionId: string; editable?: boolean; publicationId?: never }
  | { publicationId: string; announcementId?: never; versionId?: never; editable?: never };
const messages: Record<string, string> = {
  FILE_INVALID: 'Choose a nonempty PDF, PNG or JPEG up to 2 MiB with a simple filename.',
  FILE_VERSION_FROZEN: 'This Version is now frozen. Create a new Version to change attachments.',
  FILE_LIMIT_REACHED: 'A Version supports at most ten attachments.',
  FILE_RECONCILIATION_REQUIRED: 'Upload could not be completed safely. Refresh and contact an operator before trying again.',
  FILE_REQUEST_CONFLICT: 'This upload request was already used. Refresh before continuing.',
};
export function AnnouncementAttachments(props: Props) {
  const app = useAppContext(); const cache = useQueryClient(); const inputId = useId();
  const input = useRef<HTMLInputElement>(null); const busy = useRef(false);
  const [selection, setSelection] = useState<{ file: File; requestId: string }>();
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState(''); const [failure, setFailure] = useState('');
  const [removing, setRemoving] = useState<Attachment>();
  const path: `/api/v1/${string}` = props.publicationId
    ? `/api/v1/me/announcements/${props.publicationId}/attachments`
    : `/api/v1/announcements/${props.announcementId}/versions/${props.versionId}/attachments`;
  const key = ['announcement-attachments', app.currentSchool?.id, app.user.id, path];
  const query = useQuery({ queryKey: key, queryFn: () => apiRequest<{ data: Attachment[] }>(path) });
  async function mutate(operation: () => Promise<unknown>, success: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure(''); setNotice('');
    try { await operation(); setNotice(success); setRemoving(undefined); await cache.invalidateQueries({ queryKey: key }); }
    catch (error) { setFailure(error instanceof ApiClientError ? messages[error.featureCode ?? ''] ?? 'Attachment could not be changed. Refresh and check your access.' : 'Attachment request failed. Refresh before retrying.'); await cache.invalidateQueries({ queryKey: key }); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="space-y-3 rounded-md border p-4" aria-label="Attachments">
    <h3 className="font-semibold">Attachments</h3>
    {query.isPending ? <p role="status">Loading attachments…</p> : query.isError ? <p role="alert">Attachments unavailable. <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p>
      : query.data.data.length === 0 ? <p>No attachments for this Version.</p> : <ul className="space-y-2">{query.data.data.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 break-all">
        {item.state === 'READY' ? <a className="underline focus-visible:ring-2" href={`${path}/${item.id}/download`} download>{item.name}</a> : <span>{item.name} — incomplete upload ({item.state.toLowerCase()})</span>}
        <span className="text-sm">{Math.ceil(item.byteSize / 1024)} KiB</span>
        {props.editable ? <Button type="button" variant="outline" disabled={pending} aria-label={`Remove ${item.name}`} onClick={() => { setFailure(''); setRemoving(item); }}>Remove</Button> : null}
      </li>)}</ul>}
    {props.editable ? <div className="space-y-2">
      <label className="block" htmlFor={inputId}>Add a private attachment</label>
      <p id={`${inputId}-help`} className="text-sm">PDF, PNG or JPEG, up to 2 MiB each; ten attachments per Version. Published or scheduled Versions cannot change. Files are not malware-scanned.</p>
      <input ref={input} id={inputId} type="file" accept="application/pdf,image/png,image/jpeg" disabled={pending} aria-describedby={`${inputId}-help`} className="block max-w-full" onChange={(event) => {
        const file = event.target.files?.[0]; setSelection(file ? { file, requestId: crypto.randomUUID() } : undefined); setFailure('');
      }} />
      <Button type="button" disabled={pending || !selection || query.isError || query.isPending} onClick={() => {
        if (!selection) return;
        if (!selection.file.size || selection.file.size > 2 * 1024 * 1024) { setFailure(messages.FILE_INVALID!); return; }
        void mutate(async () => {
          await apiRequest(path, { method: 'POST', headers: { 'content-type': selection.file.type, 'x-file-name': encodeURIComponent(selection.file.name), 'idempotency-key': selection.requestId }, body: selection.file });
          setSelection(undefined); if (input.current) input.current.value = '';
        }, 'Attachment added.');
      }}>{pending ? 'Working…' : 'Upload attachment'}</Button>
    </div> : null}
    {failure ? <p role="alert">{failure}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <ConfirmDialog open={!!removing} title="Remove attachment?" description="Remove this attachment from the draft Version. Stored bytes are retained for controlled cleanup; published history cannot be changed."
      pending={pending} error={failure} onClose={() => { if (!pending) setRemoving(undefined); }}
      onConfirm={() => { if (removing) void mutate(() => apiRequest(`${path}/${removing.id}`, { method: 'DELETE' }), 'Attachment removed.'); }} />
  </section>;
}
