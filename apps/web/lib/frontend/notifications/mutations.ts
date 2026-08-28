import type { QueryClient } from '@tanstack/react-query';
import type { NotificationDto } from './types';
import { notificationKeys } from './queries';

export async function refreshNotificationReadState(
  queryClient: QueryClient,
  schoolId: string,
  notification?: NotificationDto,
) {
  if (notification) queryClient.setQueryData(notificationKeys.detail(schoolId, notification.id), notification);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationKeys.lists(schoolId) }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.details(schoolId) }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(schoolId) }),
  ]);
}
