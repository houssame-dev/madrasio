/**
 * Announcements event contract (Task 011).
 *
 * The ONLY producer of these events is the explicit publish use case
 * (`application/publish-announcement`). Events are emitted inside the SAME
 * transaction that commits the publication + recipient snapshot (ADR-012), so
 * a committed publication can never be lost if delivery fails afterwards.
 *
 * Event naming (BR-ANNOUNCEMENT-014, Task 009 §36):
 * - `AnnouncementPublished`         — publication sequence 1 (the first
 *   publication of a logical Announcement)
 * - `AnnouncementRevisionPublished` — publication sequence > 1 (a NEW Version
 *   of an already-published Announcement)
 *
 * The payload is the stable contract consumed by the Notifications processor.
 * `announcementVersionId` identifies the EXACT Version that was published
 * (Task 011 §14); `publicationVersion` is the per-Announcement sequence, NOT
 * the Version number.
 */

export const ANNOUNCEMENT_EVENTS = ['AnnouncementPublished', 'AnnouncementRevisionPublished'] as const;
export type AnnouncementEventName = (typeof ANNOUNCEMENT_EVENTS)[number];

/** Shared shape of the outbox payload for both announcement events. */
export interface AnnouncementEventPayload {
  eventId: string;
  eventType: AnnouncementEventName;
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  publicationId: string;
  publicationVersion: number;
  publishedAt: string;
}