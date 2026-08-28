import { apiRequest } from '@/lib/frontend/api-client';
import type {
  NotificationDto,
  NotificationListParams,
  NotificationPage,
  NotificationReadAllResult,
  NotificationUnreadCount,
} from './types';

function withQuery(path: '/api/v1/notifications', params: NotificationListParams): `/api/v1/${string}` {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return `${path}${suffix ? `?${suffix}` : ''}`;
}

async function data<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> {
  return (await apiRequest<{ data: T }>(path, init)).data;
}

export const notificationsApi = {
  list: (params: NotificationListParams) => apiRequest<NotificationPage>(withQuery('/api/v1/notifications', params)),
  detail: (id: string) => data<NotificationDto>(`/api/v1/notifications/${id}`),
  unreadCount: () => data<NotificationUnreadCount>('/api/v1/notifications/unread-count'),
  markRead: (id: string) => data<NotificationDto>(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => data<NotificationReadAllResult>('/api/v1/notifications/read-all', { method: 'POST' }),
};
