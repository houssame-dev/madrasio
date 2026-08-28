import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationUnreadBadge } from '@/components/notifications/notification-unread-badge';
import { renderNotifications } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('NotificationUnreadBadge', () => {
  it('shows the persisted current-School unread count and links to the inbox', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { count: 7 } }));
    renderNotifications(<NotificationUnreadBadge />);
    const link = await screen.findByRole('link', { name: 'Notifications, 7 unread' });
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link).toHaveTextContent('7');
  });

  it('fails softly when unread count cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('gateway', { status: 502 }));
    renderNotifications(<NotificationUnreadBadge />);
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText(/\d+/)).not.toBeInTheDocument();
  });
});
