/**
 * Notification content generation (Task 010 §21/§22).
 *
 * Pure, deterministic functions that build the `title` + `body` stored on a
 * notification at processing time from the source-domain SNAPSHOT (never
 * re-derived from live rows — Task 010 §7).
 *
 * V1 content is English-only (Task 010 §22). Localization is deferred; the
 * functions stay pure so a future translation layer can map without touching
 * the processor.
 */

/** The immutable content snapshot stored on a notification. */
export interface NotificationContent {
  title: string;
  body: string;
}

/**
 * Announcement content (Task 010 §21): the title comes from the immutable
 * `announcement_versions` row the publication references, so later revisions
 * can never rewrite an already-created notification.
 */
export function createAnnouncementPublishedNotificationContent(announcementTitle: string): NotificationContent {
  return {
    title: announcementTitle,
    body: 'A new announcement was published for your school.',
  };
}

/**
 * Result content for an INITIAL publication. Ready for the approved Result
 * recipient policy (a later task); the processor does not use it yet.
 */
export function createResultPublishedNotificationContent(input: {
  resultLabel: string;
  resultValue: string;
}): NotificationContent {
  return {
    title: 'Result published',
    body: `${input.resultLabel}: ${input.resultValue}`,
  };
}

/**
 * Result content for a REVISION. Ready for the approved Result recipient
 * policy (a later task); the processor does not use it yet.
 */
export function createResultRevisedNotificationContent(input: {
  resultLabel: string;
  resultValue: string;
}): NotificationContent {
  return {
    title: 'Result revised',
    body: `${input.resultLabel}: ${input.resultValue}`,
  };
}