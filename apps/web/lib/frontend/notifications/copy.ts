import type { NotificationReadStatus, NotificationSourceType, NotificationType } from './types';

export const notificationCopy = {
  title: 'Notifications',
  description: 'Updates delivered to you in this school.',
  filters: 'Notification filters',
  status: 'Read status',
  source: 'Source',
  allSources: 'All sources',
  markAllRead: 'Mark all as read',
  markingAllRead: 'Marking all as read…',
  markRead: 'Mark as read',
  markingRead: 'Marking as read…',
  unread: 'Unread',
  read: 'Read',
  details: 'Notification details',
  received: 'Received',
  loading: 'Loading notifications…',
  unavailable: 'Notifications are unavailable',
  empty: 'No notifications yet',
  emptyDescription: 'Notifications delivered to you in this school will appear here.',
  unreadEmpty: 'You are all caught up',
  unreadEmptyDescription: 'There are no unread notifications in this school.',
  filteredEmpty: 'No notifications match these filters',
  filteredEmptyDescription: 'Try a different read status or source.',
  allRead: 'All notifications are already read.',
  markedAllRead: (count: number) => `${count} notification${count === 1 ? '' : 's'} marked as read.`,
  unreadCount: (count: number) => `${count} unread`,
  close: 'Close notification',
} as const;

export const notificationStatusLabels: Record<NotificationReadStatus, string> = {
  ALL: 'All', UNREAD: 'Unread', READ: 'Read',
};

export const notificationSourceLabels: Record<NotificationSourceType, string> = {
  ANNOUNCEMENT_PUBLICATION: 'Announcement', RESULT_PUBLICATION: 'Result',
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  ANNOUNCEMENT_PUBLISHED: 'Announcement published',
  RESULT_PUBLISHED: 'Result published',
  RESULT_REVISED: 'Result revised',
};
