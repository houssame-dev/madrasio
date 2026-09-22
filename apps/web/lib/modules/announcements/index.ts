/**
 * Announcements module (Task 009, Task 011).
 *
 * The Announcement is the logical communication object; content lives in
 * AnnouncementVersions; publications are explicit operations that persist an
 * exact Version + its immutable recipient snapshot; outbox events are the
 * durable hand-off to Notifications (ADR-012/ADR-013).
 *
 * Public surface: domain vocabulary/events + application use cases. Drizzle
 * specifics stay inside `infrastructure/` (ADR-004, PRD.md §24).
 */

export * from './domain';
export * from './application';
export type { AnnouncementsDb } from './infrastructure/repositories/announcement-repository';