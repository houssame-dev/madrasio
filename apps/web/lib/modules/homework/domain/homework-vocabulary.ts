/**
 * Homework domain foundation (Task 008).
 *
 * Pure vocabulary shared between the future Homework Application/use-case
 * layer and the database schema. No I/O, no framework dependencies — this file
 * is intentionally minimal (Task 008 §31).
 */

/** V1 Homework lifecycle statuses — mirrors the `homework_status` database enum. */
export const HOMEWORK_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

/**
 * V1 Homework submission statuses — mirrors the `homework_submission_status`
 * database enum.
 *
 * NOT_SUBMITTED is deliberately NOT a stored status (Task 008 §27): a Student
 * who has not submitted simply has no submission row. Absence of a row
 * represents NOT_SUBMITTED.
 */
export const HOMEWORK_SUBMISSION_STATUSES = ['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED'] as const;
export type HomeworkSubmissionStatus = (typeof HOMEWORK_SUBMISSION_STATUSES)[number];

/** V1 Homework target types — mirrors the `homework_target_type` database enum. */
export const HOMEWORK_TARGET_TYPES = ['CLASS'] as const;
export type HomeworkTargetType = (typeof HOMEWORK_TARGET_TYPES)[number];