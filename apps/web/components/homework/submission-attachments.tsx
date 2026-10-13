'use client';
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { useAppContext } from '@/components/app/app-context';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { formatSchoolInstant } from '@school/shared';

interface Attachment { id: string; name: string; byteSize: number; submissionRecordedAt: string }
export function SubmissionAttachments({ submissionId, editable = false }: { submissionId: string; editable?: boolean }) {
  const app = useAppContext(); const cache = useQueryClient(); const inputId = useId();
  const input = useRef<HTMLInputElement>(null); const busy = useRef(false);
  const [selection, setSelection] = useState<{ file: File; requestId: string }>();
  const [pending, setPending] = useState(false); const [failure, setFailure] = useState(''); const [notice, setNotice] = useState('');
  const path = `/api/v1/homework-submissions/${submissionId}/attachments` as const;
  const key = ['submission-attachments', app.currentSchool?.id, app.user.id, submissionId];
  const query = useQuery({ queryKey: key, queryFn: () => apiRequest<{ data: Attachment[] }>(path) });
  async function upload() {
    if (!selection || busy.current) return;
    if (!selection.file.size || selection.file.size > 2 * 1024 * 1024) { setFailure('Choose a nonempty PDF, PNG or JPEG up to 2 MiB.'); return; }
    busy.current = true; setPending(true); setFailure(''); setNotice('');
    try {
      await apiRequest(path, { method: 'POST', headers: { 'content-type': selection.file.type,
        'x-file-name': encodeURIComponent(selection.file.name), 'idempotency-key': selection.requestId }, body: selection.file });
      setSelection(undefined); if (input.current) input.current.value = '';
      setNotice('Attachment added. Existing attachments are retained across resubmission.');
    } catch (error) {
      setFailure(error instanceof ApiClientError && error.featureCode === 'FILE_RECONCILIATION_REQUIRED'
        ? 'Upload outcome needs operator reconciliation. Do not start another upload for this file.'
        : 'Attachment could not be added. Refresh and check access, file type and submission state.');
    } finally { await cache.invalidateQueries({ queryKey: key }); busy.current = false; setPending(false); }
  }
  return <section className="space-y-3 rounded-md border p-4" aria-label="Submission attachments">
    <h3 className="font-semibold">Submission attachments</h3>
    {query.isPending ? <p role="status">Loading attachments…</p> : query.isError ? <p role="alert">Attachments unavailable. <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p>
      : query.data.data.length === 0 ? <p>No delivered attachments.</p> : <ul className="space-y-2">{query.data.data.map((item) => <li key={item.id} className="flex flex-wrap gap-3 break-all">
        <a className="underline focus-visible:ring-2" href={`${path}/${item.id}/download`} download>{item.name}</a>
        <span>{Math.ceil(item.byteSize / 1024)} KiB</span>
        <span className="text-sm">Recording: {app.currentSchool?.timezone ? formatSchoolInstant(item.submissionRecordedAt, app.currentSchool.timezone) : 'School timezone unavailable'}</span>
      </li>)}</ul>}
    {editable ? <div className="space-y-2">
      <label htmlFor={inputId}>Add a private submission attachment</label>
      <p id={`${inputId}-help`} className="text-sm">PDF, PNG or JPEG, up to 2 MiB; ten upload intents per logical Submission. Files are retained, not replaced on resubmission. No malware scanning.</p>
      <input ref={input} id={inputId} type="file" accept="application/pdf,image/png,image/jpeg" disabled={pending} className="block max-w-full" aria-describedby={`${inputId}-help`} onChange={(event) => {
        const file = event.target.files?.[0]; setSelection(file ? { file, requestId: crypto.randomUUID() } : undefined); setFailure('');
      }} />
      <Button type="button" disabled={pending || !selection || query.isError || query.isPending} onClick={() => void upload()}>{pending ? 'Uploading…' : 'Upload attachment'}</Button>
    </div> : null}
    {failure ? <p role="alert">{failure}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </section>;
}
