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

type ResultContent = { resultValue: string; displayContext?: import('@school/database').ResultDisplayContext; resultType?: string; publicationVersion?: number };
function resultBody(input: ResultContent) {
  const context = input.displayContext;
  if (!context) return `Result value: ${input.resultValue}`;
  return `${context.studentName} · ${context.subjectName ?? input.resultType ?? 'Result'} · ${context.academicYearName}${context.academicPeriodName ? ` · ${context.academicPeriodName}` : ''} · Result value: ${input.resultValue} · ${input.publicationVersion === 1 ? 'Initial publication' : `Revised publication ${input.publicationVersion}`}`;
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
 * Result content for an INITIAL publication (Task 012 §14). Built ONLY from
 * immutable event payload data (the frozen `resultValue`), never from mutable
 * live Result rows — a later revision can never rewrite an already-created
 * notification. Title follows the approved policy example: "Result published".
 */
export function createResultPublishedNotificationContent(input: ResultContent): NotificationContent {
  return {
    title: 'Result published',
    body: resultBody(input),
  };
}

/**
 * Result content for a REVISION (Task 012 §14). Title follows the approved
 * policy example: "Result updated". Same frozen-data-only rule as the initial
 * publication content.
 */
export function createResultRevisedNotificationContent(input: ResultContent): NotificationContent {
  return {
    title: 'Result updated',
    body: resultBody(input),
  };
}
