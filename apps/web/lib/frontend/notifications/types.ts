export const notificationTypes = ['ANNOUNCEMENT_PUBLISHED', 'RESULT_PUBLISHED', 'RESULT_REVISED'] as const;
export const notificationSourceTypes = ['ANNOUNCEMENT_PUBLICATION', 'RESULT_PUBLICATION'] as const;
export const notificationReadStatuses = ['ALL', 'UNREAD', 'READ'] as const;

export type NotificationType = (typeof notificationTypes)[number];
export type NotificationSourceType = (typeof notificationSourceTypes)[number];
export type NotificationReadStatus = (typeof notificationReadStatuses)[number];

export interface NotificationDto {
  id: string;
  notificationType: NotificationType;
  sourceType: NotificationSourceType;
  sourceId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListParams {
  page?: number;
  pageSize?: number;
  status?: NotificationReadStatus;
  notificationType?: NotificationType;
  sourceType?: NotificationSourceType;
}

export interface NotificationPage {
  data: NotificationDto[];
  meta: { page: number; pageSize: number; total: number };
}

export interface NotificationUnreadCount { count: number }
export interface NotificationReadAllResult { updatedCount: number }
