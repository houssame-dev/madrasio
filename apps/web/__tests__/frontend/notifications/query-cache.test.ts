import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { refreshNotificationReadState } from '@/lib/frontend/notifications/mutations';
import { notificationKeys } from '@/lib/frontend/notifications/queries';
import { notification, otherSchoolId, schoolId } from './test-helpers';

describe('notification query cache', () => {
  it('partitions lists, details, and unread counts by current School', () => {
    expect(notificationKeys.list(schoolId, { status: 'UNREAD' })).not.toEqual(notificationKeys.list(otherSchoolId, { status: 'UNREAD' }));
    expect(notificationKeys.detail(schoolId, notification.id)).not.toEqual(notificationKeys.detail(otherSchoolId, notification.id));
    expect(notificationKeys.unreadCount(schoolId)).not.toEqual(notificationKeys.unreadCount(otherSchoolId));
  });

  it('refreshes current-School lists, details, and persisted unread count after a read action', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const read = { ...notification, readAt: '2026-08-20T11:00:00.000Z' };
    await refreshNotificationReadState(client, schoolId, read);
    expect(client.getQueryData(notificationKeys.detail(schoolId, notification.id))).toEqual(read);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.lists(schoolId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.details(schoolId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.unreadCount(schoolId) });
  });
});
