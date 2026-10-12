import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipientAnnouncement, RecipientAnnouncements } from '@/components/announcements/recipient-announcements';
import { AnnouncementBody } from '@/components/announcements/announcement-body';
import { AnnouncementScheduleDialog } from '@/components/announcements/announcement-schedule-dialog';
import { AnnouncementPublications } from '@/components/announcements/announcement-publications';
import { AnnouncementTargets } from '@/components/announcements/announcement-targets';
import { AnnouncementVersions } from '@/components/announcements/announcement-versions';
import { NotificationDetail } from '@/components/notifications/notification-detail';
import { visibleNavigationItems } from '@/lib/frontend/navigation';
import { announcementId, publicationId, versionId, renderAnnouncements, version, year, schoolClass, targetId } from './test-helpers';

const navigation = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.query), usePathname: () => '/announcements/inbox', useRouter: () => ({ replace: navigation.replace }) }));
beforeEach(() => { navigation.query = ''; navigation.replace.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const published = { id: publicationId, announcementId, publicationVersion: 2, versionNumber: 3, title: 'Published correction', publishedAt: '2026-06-15T16:00:00Z', body: '<p><strong>Safe notice</strong></p><script>attack()</script>', bodyFormat: 'HTML' };

describe('recipient announcement journey', () => {
  it.each([`/announcements/inbox/${publicationId}`, null, 'https://outside.example/test', `//outside.example/${publicationId}`])('only links an authorized relative notification destination: %s', async (destination) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: {
      id: publicationId, notificationType: 'ANNOUNCEMENT_PUBLISHED', sourceType: 'ANNOUNCEMENT_PUBLICATION', sourceId: publicationId,
      title: 'Notification notice', body: '<b>Legacy plain message</b>', createdAt: published.publishedAt, readAt: null, destination,
    } }));
    const { container } = renderAnnouncements(<NotificationDetail schoolId="school" notificationId={publicationId} onClose={vi.fn()} />, 'PARENT');
    await screen.findByRole('heading', { name: 'Notification notice' });
    if (destination === `/announcements/inbox/${publicationId}`) {
      expect(screen.getByRole('link', { name: 'Read published announcement' })).toHaveAttribute('href', destination);
    } else {
      expect(screen.queryByRole('link', { name: 'Read published announcement' })).not.toBeInTheDocument();
      expect(screen.getByText('Published announcement navigation is unavailable for your current access.')).toBeInTheDocument();
    }
    expect(container.querySelector('b')).toBeNull();
  });

  it.each(['PARENT', 'TEACHER'] as const)('offers ordinary %s inbox navigation, paging and publication links without author controls', async (role) => {
    expect(visibleNavigationItems(role)).toContainEqual(expect.objectContaining({ href: '/announcements/inbox' }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = new URL(String(input), 'http://local').searchParams.get('page');
      return Response.json({ data: [{ ...published, title: page === '2' ? 'Next page notice' : published.title }], meta: { page: Number(page), pageSize: 20, total: 21 } });
    });
    renderAnnouncements(<RecipientAnnouncements />, role);
    expect(await screen.findByRole('link', { name: published.title })).toHaveAttribute('href', `/announcements/inbox/${publicationId}`);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(navigation.replace).toHaveBeenCalledWith('/announcements/inbox?page=2');
    cleanup(); navigation.query = 'page=2';
    renderAnnouncements(<RecipientAnnouncements />, role);
    expect(await screen.findByRole('link', { name: 'Next page notice' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true);
    expect(screen.queryByRole('button', { name: /publish|reschedule|create|cancel publication/i })).not.toBeInTheDocument();
  });
  it('reads exact publication context and sanitized content with a safe back link', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json({ data: String(input).endsWith('/attachments') ? [] : published }));
    const { container } = renderAnnouncements(<RecipientAnnouncement publicationId={publicationId} />, 'PARENT', 'America/New_York');
    expect(await screen.findByRole('heading', { name: published.title })).toBeInTheDocument();
    expect(screen.getByText(/Content v3/)).toHaveTextContent('2026-06-15 12:00 (America/New_York)');
    expect(container.querySelector('strong')).toHaveTextContent('Safe notice');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to School announcements' })).toHaveAttribute('href', '/announcements/inbox');
  });
  it('does not reinterpret legacy HTML-looking plain text', () => {
    const { container } = render(<AnnouncementBody body="<img src=x onerror=attack()>" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=attack()>');
  });
  it('shows empty and denied states without leaking content or management controls', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }));
    renderAnnouncements(<RecipientAnnouncements />, 'PARENT');
    expect(await screen.findByText('No published announcements on this page.')).toBeInTheDocument();
    cleanup(); request.mockResolvedValue(Response.json({ error: { code: 'NOT_FOUND', message: 'Unavailable' } }, { status: 404 }));
    renderAnnouncements(<RecipientAnnouncement publicationId={publicationId} />, 'PARENT');
    expect(await screen.findByText('This publication is unavailable for your current access.')).toBeInTheDocument();
    expect(screen.queryByText(published.title)).not.toBeInTheDocument();
  });
});

describe('schedule and target controls', () => {
  it('traverses immutable Version history beyond the first page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/attachments')) return Response.json({ data: [] });
      const page = new URL(String(input), 'http://local').searchParams.get('page');
      return Response.json({ data: [{ ...version, title: page === '2' ? 'Earlier immutable version' : version.title }], meta: { page: Number(page), pageSize: 50, total: 51 } });
    });
    renderAnnouncements(<AnnouncementVersions schoolId="school" announcementId={announcementId} latestVersion={version} editable={false} />);
    await screen.findByRole('heading', { name: version.title });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Earlier immutable version' })).toBeInTheDocument();
  });
  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])('rejects nonexistent/ambiguous reschedule wall time %s', async (wall) => {
    const request = vi.spyOn(globalThis, 'fetch');
    renderAnnouncements(<AnnouncementScheduleDialog open schoolId="school" announcementId={announcementId} versionId={versionId} publicationId={publicationId} onClose={vi.fn()} />, 'SCHOOL_ADMIN', 'America/New_York');
    fireEvent.change(screen.getByLabelText('Publication date and time'), { target: { value: wall } });
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(await screen.findByText(/Choose an unambiguous, valid date and time/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
  it('reschedules through PATCH with the exact School-zone instant, not browser timezone', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { status: 'SCHEDULED' } }));
    renderAnnouncements(<AnnouncementScheduleDialog open schoolId="school" announcementId={announcementId} versionId={versionId} publicationId={publicationId} onClose={vi.fn()} />, 'SCHOOL_ADMIN', 'America/New_York');
    fireEvent.change(screen.getByLabelText('Publication date and time'), { target: { value: '2035-06-15T12:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(request.mock.calls[0][1]?.method).toBe('PATCH');
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ action: 'reschedule', scheduledAt: '2035-06-15T16:00:00.000Z' });
  });
  it('requires cancellation confirmation and hides actions for immutable publications', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => init?.method === 'PATCH' ? Response.json({ data: {} }) : Response.json({ data: [{ ...published, announcementVersionId: versionId, status: 'SCHEDULED', scheduledAt: '2035-01-01T00:00:00Z', recipientCount: 0 }], meta: { page: 1, pageSize: 20, total: 1 } }));
    renderAnnouncements(<AnnouncementPublications schoolId="school" announcementId={announcementId} versions={[version]} canPublish />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel publication #2' }));
    expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Scheduled publication cancelled. No recipients were notified.');
    const call = request.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ action: 'cancel' });
    cleanup(); request.mockResolvedValue(Response.json({ data: [{ ...published, announcementVersionId: versionId, status: 'PUBLISHED', recipientCount: 2 }], meta: { page: 1, pageSize: 20, total: 1 } }));
    renderAnnouncements(<AnnouncementPublications schoolId="school" announcementId={announcementId} versions={[version]} canPublish />);
    await screen.findByText('PUBLISHED');
    expect(screen.queryByRole('button', { name: /Cancel publication|Reschedule/ })).not.toBeInTheDocument();
  });
  it('removes only the selected unpublished target through the strict endpoint', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => init?.method === 'DELETE' ? Response.json({ data: { removed: true } }) : Response.json({ data: [{ id: targetId, announcementVersionId: versionId, audience: 'PARENTS', targetType: 'CLASS', academicYearId: year.id, classId: schoolClass.id }] }));
    renderAnnouncements(<AnnouncementTargets schoolId="school" announcementId={announcementId} version={version} years={[year]} classes={[schoolClass]} editable />);
    await userEvent.click(await screen.findByRole('button', { name: /Remove PARENTS/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true));
    const call = request.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ announcementVersionId: versionId, targetId });
  });
});
