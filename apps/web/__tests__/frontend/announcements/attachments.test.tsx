import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnouncementAttachments } from '@/components/announcements/announcement-attachments';
import { announcementId, versionId, publicationId, renderAnnouncements } from './test-helpers';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const item = { id: '00000000-0000-4000-8000-000000000800', name: 'notice.pdf', mediaType: 'application/pdf', byteSize: 20, state: 'READY' };

it('renders private exact-publication download navigation without Parent upload/removal controls', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [item] }));
  renderAnnouncements(<AnnouncementAttachments publicationId={publicationId} />, 'PARENT');
  expect(await screen.findByRole('link', { name: 'notice.pdf' })).toHaveAttribute('href', `/api/v1/me/announcements/${publicationId}/attachments/${item.id}/download`);
  expect(screen.queryByLabelText('Add a private attachment')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
});
it('uploads raw bytes with a stable retry key, shows pending state, and never submits School/object authority', async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_path, init) => {
    if (init?.method === 'POST') { await gate; return Response.json({ data: item }); }
    return Response.json({ data: [] });
  });
  renderAnnouncements(<AnnouncementAttachments announcementId={announcementId} versionId={versionId} editable />);
  await screen.findByText('No attachments for this Version.');
  const file = new File(['%PDF-1.7 fixture'], 'notice.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Add a private attachment'), { target: { files: [file] } });
  await userEvent.click(screen.getByRole('button', { name: 'Upload attachment' }));
  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(calls).toHaveLength(1);
  expect(calls[0]![0]).toBe(`/api/v1/announcements/${announcementId}/versions/${versionId}/attachments`);
  expect(calls[0]![1]!.body).toBe(file); const headers = new Headers(calls[0]![1]!.headers);
  expect(headers.get('idempotency-key')).toMatch(/^[a-f0-9-]{36}$/); expect(headers.get('x-file-name')).toBe('notice.pdf');
  expect([...headers.keys()].join(' ')).not.toMatch(/school|user|object|secret/);
  release(); await screen.findByText('Attachment added.');
});
it('confirms logical removal and denies download for incomplete uploads', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_path, init) => Response.json({ data: init?.method === 'DELETE' ? { removed: true } : [{ ...item, state: 'UPLOADING' }] }));
  renderAnnouncements(<AnnouncementAttachments announcementId={announcementId} versionId={versionId} editable />);
  await screen.findByText(/incomplete upload/); expect(screen.queryByRole('link', { name: item.name })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove notice.pdf' }));
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([path, init]) => String(path).endsWith(`/attachments/${item.id}`) && init?.method === 'DELETE')).toBe(true));
});
it('never exposes raw provider error wording and retries the same upload identity', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_path, init) => init?.method === 'POST'
    ? Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'FILE_RECONCILIATION_REQUIRED', message: 'raw-provider-secret' } }, { status: 422 })
    : Response.json({ data: [] }));
  renderAnnouncements(<AnnouncementAttachments announcementId={announcementId} versionId={versionId} editable />);
  await screen.findByText('No attachments for this Version.');
  fireEvent.change(screen.getByLabelText('Add a private attachment'), { target: { files: [new File(['%PDF-1.7 fixture'], 'notice.pdf', { type: 'application/pdf' })] } });
  await userEvent.click(screen.getByRole('button', { name: 'Upload attachment' }));
  await screen.findByText(/contact an operator/); expect(screen.queryByText('raw-provider-secret')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Upload attachment' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Upload attachment' }));
  const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(calls).toHaveLength(2);
  expect(new Headers(calls[0]![1]?.headers).get('idempotency-key')).toBe(new Headers(calls[1]![1]?.headers).get('idempotency-key'));
});
