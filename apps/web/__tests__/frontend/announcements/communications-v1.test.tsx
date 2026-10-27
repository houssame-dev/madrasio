import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnouncementPublicationActions } from '@/components/announcements/announcement-publication-actions';
import { AnnouncementDetailWorkspace } from '@/components/announcements/announcement-detail';
import { NotificationRow } from '@/components/notifications/notification-row';
import {
  announcementId,
  classId,
  detail,
  page,
  renderAnnouncements,
  schoolClass,
  schoolId,
  targetId,
  version,
  year,
  yearId,
} from './test-helpers';
import { notification } from '../notifications/test-helpers';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(['UPLOADING', 'REJECTED', 'failed', 'no-targets'])(
  'blocks exact-Version confirmation for %s without a mutation',
  async (state) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/attachments')
          ? state === 'failed'
            ? Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 503 })
            : Response.json({
                data: state === 'no-targets' ? [] : [{ id: targetId, name: 'private.pdf', state }],
              })
          : Response.json({
              data:
                state === 'no-targets'
                  ? []
                  : [
                      {
                        id: targetId,
                        academicYearId: yearId,
                        classId,
                        audience: 'PARENTS',
                        targetType: 'CLASS',
                      },
                    ],
            }),
      );
    renderAnnouncements(
      <AnnouncementPublicationActions
        schoolId={schoolId}
        detail={detail}
        canPublish
        canManage
        currentVersionPublished={false}
        years={[year]}
        classes={[schoolClass]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(await screen.findByText(/Choose at least one target/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveTextContent('School closure');
    expect(screen.getByRole('dialog')).toHaveTextContent('v1');
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  },
);
it('hides management controls when publication freeze information cannot load', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/publications?'))
      return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 503 });
    if (url.includes('/versions?')) return Response.json(page([version]));
    if (url.includes('/academic-years?')) return Response.json(page([year]));
    if (url.includes('/classes?')) return Response.json(page([schoolClass]));
    return Response.json({ data: detail });
  });
  renderAnnouncements(<AnnouncementDetailWorkspace announcementId={announcementId} />);
  await screen.findByText('Announcement unavailable');
  expect(screen.queryByLabelText('Add a private attachment')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Publish now' })).not.toBeInTheDocument();
});
it('formats notification time in School timezone regardless of browser timezone', () => {
  const onOpen = vi.fn();
  renderAnnouncements(
    <NotificationRow notification={notification} onOpen={onOpen} />,
    'PARENT',
    'America/New_York',
  );
  expect(screen.getByText('2026-08-20 06:00 (America/New_York)')).toBeInTheDocument();
  expect(onOpen).not.toHaveBeenCalled();
});
