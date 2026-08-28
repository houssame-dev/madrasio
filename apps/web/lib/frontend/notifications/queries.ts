import type { NotificationListParams } from './types';

export const notificationKeys = {
  all: (schoolId: string) => ['notifications', schoolId] as const,
  lists: (schoolId: string) => ['notifications', schoolId, 'list'] as const,
  list: (schoolId: string, params: NotificationListParams) => ['notifications', schoolId, 'list', params] as const,
  details: (schoolId: string) => ['notifications', schoolId, 'detail'] as const,
  detail: (schoolId: string, id: string) => ['notifications', schoolId, 'detail', id] as const,
  unreadCount: (schoolId: string) => ['notifications', schoolId, 'unread-count'] as const,
};
