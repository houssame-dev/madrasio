import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnouncementTargets } from '@/components/announcements/announcement-targets';
import { AnnouncementForm } from '@/components/announcements/announcement-form';
import { announcementId, classId, renderAnnouncements, schoolClass, schoolId, targetId, version, versionId, year, yearId } from './test-helpers';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { schoolId, announcementId, version, years: [year], classes: [schoolClass], editable: true };
it('reports recipient loading errors without pretending there are no targets and permits retry', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'hidden' } }, { status: 500 })).mockResolvedValue(Response.json({ data: [] }));
  const view = renderAnnouncements(<AnnouncementTargets {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading recipient scope');
  expect(await screen.findByRole('alert')).toHaveTextContent('Recipient scope could not be loaded.');
  expect(screen.queryByText('No targets are attached to this Version.')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No targets are attached to this Version.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2); view.unmount();
});
it('shows saved recipient scope after authoritative refetch without publishing or inventing recipients', async () => {
  const target = { id: targetId, announcementVersionId: versionId, audience: 'PARENTS', targetType: 'CLASS', academicYearId: yearId, classId };
  let saved = false;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    if (init?.method === 'POST') saved = true;
    return Response.json({ data: saved ? [target] : [] });
  });
  renderAnnouncements(<AnnouncementTargets {...props} teacherClassIds={new Set([classId])} />);
  await screen.findByText('No targets are attached to this Version.');
  await userEvent.selectOptions(screen.getByLabelText('Academic Year'), yearId);
  await userEvent.selectOptions(screen.getByLabelText('Class'), classId);
  await userEvent.click(screen.getByRole('button', { name: 'Add target' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Recipient scope updated.'));
  expect(within(screen.getByRole('list')).getByText('Class A')).toBeInTheDocument();
  expect(screen.queryByText('No targets are attached to this Version.')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'SCHOOL' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/targets'))).toBe(true);
});
it('explains draft visibility and keeps the sanitized preview separate from publication', async () => {
  renderAnnouncements(<AnnouncementForm schoolId={schoolId} onCancel={vi.fn()} />);
  expect(screen.getByText(/Saving creates unpublished content/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Sanitized content preview' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Publish now' })).not.toBeInTheDocument();
});
