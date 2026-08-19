/**
 * Notifications domain vocabulary (Task 010 §3/§4/§6).
 *
 * Pure vocabulary — no I/O, no framework dependencies. These identifiers
 * mirror EXACTLY the database enums (`notification_type`,
 * `notification_source_type`) and the stable outbox event names the
 * Notifications processor consumes, so the application layer, repositories
 * and tests share one source of truth.
 */

/** V1 notification types — mirrors the `notification_type` database enum. */
export const NOTIFICATION_TYPES = ['ANNOUNCEMENT_PUBLISHED', 'RESULT_PUBLISHED', 'RESULT_REVISED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** V1 notification source kinds — mirrors the `notification_source_type` database enum. */
export const NOTIFICATION_SOURCE_TYPES = ['ANNOUNCEMENT_PUBLICATION', 'RESULT_PUBLICATION'] as const;
export type NotificationSourceType = (typeof NOTIFICATION_SOURCE_TYPES)[number];

/**
 * Stable outbox event names consumed by the Notifications processor
 * (Task 010 §13). The grades events already exist (`grades/domain`);
 * `AnnouncementPublished` is produced by the announcements module (Task 009
 * publish use case) whose application layer is a later task.
 */
export const NOTIFICATION_EVENTS = ['AnnouncementPublished', 'ResultPublished', 'ResultRevisionPublished'] as const;
export type NotificationEventName = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Maps a source kind to the notification types that may reference it
 * (mirrors the `notifications_type_source_check` database CHECK).
 */
export const NOTIFICATION_SOURCE_TYPES_BY_SOURCE_TYPE: Record<NotificationSourceType, readonly NotificationType[]> = {
  ANNOUNCEMENT_PUBLICATION: ['ANNOUNCEMENT_PUBLISHED'],
  RESULT_PUBLICATION: ['RESULT_PUBLISHED', 'RESULT_REVISED'],
};

/** Maps a consumed outbox event to its notification type (or null when unsupported). */
export function notificationTypeForEvent(eventType: string): NotificationType | null {
  if (eventType === 'AnnouncementPublished') return 'ANNOUNCEMENT_PUBLISHED';
  if (eventType === 'ResultPublished') return 'RESULT_PUBLISHED';
  if (eventType === 'ResultRevisionPublished') return 'RESULT_REVISED';
  return null;
}

/** Maps a consumed outbox event to its source kind (or null when unsupported). */
export function notificationSourceTypeForEvent(eventType: string): NotificationSourceType | null {
  if (eventType === 'AnnouncementPublished') return 'ANNOUNCEMENT_PUBLICATION';
  if (eventType === 'ResultPublished' || eventType === 'ResultRevisionPublished') return 'RESULT_PUBLICATION';
  return null;
}