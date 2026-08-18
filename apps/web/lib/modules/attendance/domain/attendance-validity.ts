/**
 * Attendance domain foundation (Task 007).
 *
 * Pure vocabulary + the single documented invariant of the V1 daily attendance
 * model. No I/O, no framework dependencies. The full Application/use-case
 * layer is a later task — this file is intentionally minimal (Task 007 §24).
 */

/** V1 daily attendance statuses — mirrors the `attendance_status` database enum. */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** The minimal shape of an AttendanceRecord the invariant is evaluated against. */
export interface AttendanceRecordContext {
  schoolId: string;
  classId: string;
  attendanceDate: string;
}

/** The minimal shape of a StudentEnrollment needed to evaluate the invariant. */
export interface StudentEnrollmentContext {
  schoolId: string;
  classId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export type AttendanceValidity =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'NO_ENROLLMENT'
        | 'SCHOOL_MISMATCH'
        | 'CLASS_MISMATCH'
        | 'BEFORE_EFFECTIVE_FROM'
        | 'AFTER_EFFECTIVE_UNTIL';
    };

/**
 * Application-layer invariant (Task 007 §6, §24):
 *
 *   An AttendanceRecord's date must correspond to a valid StudentEnrollment in
 *   the SAME Class:
 *
 *     enrollment.school_id = record.school_id
 *     AND enrollment.class_id = record.class_id
 *     AND enrollment.effective_from <= record.attendance_date
 *     AND (enrollment.effective_until IS NULL
 *          OR record.attendance_date <= enrollment.effective_until)
 *
 * This CANNOT be expressed by a safe database FK/constraint (it is a date-range
 * join against enrollment history), so it is NOT enforced in the schema and is
 * left to the Application layer. A `null` enrollment means the student has no
 * enrollment covering the date → `NO_ENROLLMENT`.
 *
 * Historical integrity (Task 007 §7, BR-GLOBAL-003): the validity of a
 * historical AttendanceRecord is evaluated against the enrollment that was in
 * effect ON the attendance date — an ENDED enrollment whose effective range
 * covers the date is still a VALID enrollment/Class context for that date.
 * "Today's current Class" is never used to re-validate old records.
 *
 * `attendanceDate`, `effectiveFrom` and `effectiveUntil` are ISO `YYYY-MM-DD`
 * calendar dates; string comparison is chronological for that format.
 */
export function validateAttendanceContext(
  record: AttendanceRecordContext,
  enrollment: StudentEnrollmentContext | null,
): AttendanceValidity {
  if (!enrollment) return { valid: false, reason: 'NO_ENROLLMENT' };
  if (enrollment.schoolId !== record.schoolId) return { valid: false, reason: 'SCHOOL_MISMATCH' };
  if (enrollment.classId !== record.classId) return { valid: false, reason: 'CLASS_MISMATCH' };
  if (record.attendanceDate < enrollment.effectiveFrom) return { valid: false, reason: 'BEFORE_EFFECTIVE_FROM' };
  if (enrollment.effectiveUntil !== null && record.attendanceDate > enrollment.effectiveUntil) {
    return { valid: false, reason: 'AFTER_EFFECTIVE_UNTIL' };
  }
  return { valid: true };
}