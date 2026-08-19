/**
 * Announcements domain foundation (Task 009).
 *
 * Pure vocabulary shared between the future Announcements Application/use-case
 * layer and the database schema. No I/O, no framework dependencies — this file
 * is intentionally minimal (Task 009 §46/§47).
 */

/** V1 Announcement lifecycle — mirrors the `announcement_status` database enum. */
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/**
 * V1 Announcement audiences — mirrors the `announcement_audience` database
 * enum. The audience identifies WHO should receive the Announcement
 * (Task 009 §7/§11). STUDENTS is NOT an audience in V1 (no Student login).
 */
export const ANNOUNCEMENT_AUDIENCES = ['PARENTS', 'TEACHERS'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/**
 * V1 Announcement target types — mirrors the `announcement_target_type`
 * database enum. The target identifies WHERE the audience applies
 * (Task 009 §8/§11).
 */
export const ANNOUNCEMENT_TARGET_TYPES = ['SCHOOL', 'CLASS'] as const;
export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

/**
 * V1 publication lifecycle — mirrors the `announcement_publication_status`
 * database enum. Deliberately SEPARATE from Announcement status (Task 009 §2/§38).
 */
export const ANNOUNCEMENT_PUBLICATION_STATUSES = ['SCHEDULED', 'PUBLISHED'] as const;
export type AnnouncementPublicationStatus = (typeof ANNOUNCEMENT_PUBLICATION_STATUSES)[number];