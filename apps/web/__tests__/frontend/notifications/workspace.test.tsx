import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';
import { notification, page, renderNotifications } from './test-helpers';

const navigation = vi.hoisted(() => ({ pathname: '/notifications', search: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.search,
  useRouter: () => ({ replace: navigation.replace }),
}));

function json(value: unknown, status = 200) { return Response.json(value, { status }); }

beforeEach(() => {
  navigation.search = new URLSearchParams();
  navigation.replace.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('NotificationsWorkspace', () => {
  it.each(['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'SUPER_ADMIN'] as const)('allows %s to read only the returned self-owned inbox projection', async (role) => {
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input); requests.push(url);
      if (url.includes('unread-count')) return json({ data: { count: 1 } });
      return json(page([notification]));
    });
    renderNotifications(<NotificationsWorkspace />, role);
    expect(await screen.findByRole('button', { name: 'Unread notification: School closure' })).toBeInTheDocument();
    expect(screen.getByText('The school will close tomorrow.')).toBeInTheDocument();
    expect(requests.every((url) => !url.includes('schoolId') && !url.includes('recipientUserId'))).toBe(true);
  });

  it('uses backend read/source filters and server pagination in the URL contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('unread-count') ? json({ data: { count: 0 } }) : json(page([])));
    renderNotifications(<NotificationsWorkspace />);
    await screen.findByRole('heading', { name: 'No notifications yet', level: 2 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Read status'), { target: { value: 'UNREAD' } });
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?status=UNREAD&page=1', { scroll: false });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'RESULT_PUBLICATION' } });
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?sourceType=RESULT_PUBLICATION&page=1', { scroll: false });
  });

  it('renders the exact committed Result source and revision type from the persisted DTO', async () => {
    const resultNotification = { ...notification, notificationType: 'RESULT_REVISED' as const, sourceType: 'RESULT_PUBLICATION' as const, title: 'Result revised' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('unread-count') ? json({ data: { count: 1 } }) : json(page([resultNotification])));
    renderNotifications(<NotificationsWorkspace />);
    expect((await screen.findAllByText('Result revised')).length).toBeGreaterThan(0);
    const row = screen.getByRole('button', { name: 'Unread notification: Result revised' });
    expect(within(row).getByText('Result')).toBeInTheDocument();
  });

  it('opens historical detail without source or relationship lookups and marks one read with an empty body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let read = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url.includes('unread-count')) return json({ data: { count: calls.filter((call) => call.url.includes('unread-count')).length === 1 ? 1 : 0 } });
      if (url.endsWith(`/${notification.id}/read`)) { read = true; return json({ data: { ...notification, readAt: '2026-08-20T11:00:00.000Z' } }); }
      if (url.endsWith(`/${notification.id}`)) return json({ data: { ...notification, readAt: read ? '2026-08-20T11:00:00.000Z' : null } });
      return json(page([{ ...notification, readAt: read ? '2026-08-20T11:00:00.000Z' : null }]));
    });
    renderNotifications(<NotificationsWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: 'Unread notification: School closure' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notification details' });
    expect(within(dialog).getByText('The school will close tomorrow.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
    const mark = calls.find((call) => call.url.endsWith(`/${notification.id}/read`));
    expect(mark?.init).toMatchObject({ method: 'POST' });
    expect(mark?.init?.body).toBeUndefined();
    expect(calls.some((call) => /announcements|results|relationships|assignments|enrollments|outbox/.test(call.url))).toBe(false);
  });

  it('marks all read without recipient authority and reports the persisted update result', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url.endsWith('/read-all')) return json({ data: { updatedCount: 2 } });
      if (url.includes('unread-count')) return json({ data: { count: 2 } });
      return json(page([notification]));
    });
    renderNotifications(<NotificationsWorkspace />);
    const button = await screen.findByRole('button', { name: 'Mark all as read' });
    await userEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('2 notifications marked as read.');
    const request = calls.find((call) => call.url.endsWith('/read-all'));
    expect(request?.init).toMatchObject({ method: 'POST' });
    expect(request?.init?.body).toBeUndefined();
  });

  it('distinguishes an empty unread inbox and maps a safe server error', async () => {
    navigation.search = new URLSearchParams('status=UNREAD');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('unread-count')) return json({ data: { count: 0 } });
      return json(page([]));
    });
    const view = renderNotifications(<NotificationsWorkspace />);
    expect(await screen.findByRole('heading', { name: 'You are all caught up' })).toBeInTheDocument();
    view.unmount();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('unread-count') ? json({ data: { count: 0 } }) : json({ error: { code: 'NOT_FOUND', featureCode: 'NOTIFICATION_NOT_FOUND', message: 'Hidden' } }, 404));
    renderNotifications(<NotificationsWorkspace />);
    expect(await screen.findByText('This notification is unavailable in your current school inbox.')).toBeInTheDocument();
  });
});
