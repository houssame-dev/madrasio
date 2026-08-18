import { describe, expect, it } from 'vitest';

import {
  ATTENDANCE_STATUSES,
  validateAttendanceContext,
  type AttendanceRecordContext,
  type StudentEnrollmentContext,
} from '@/lib/modules/attendance';

const record: AttendanceRecordContext = {
  schoolId: 'school-a',
  classId: 'class-a',
  attendanceDate: '2026-09-15',
};

const enrollment: StudentEnrollmentContext = {
  schoolId: 'school-a',
  classId: 'class-a',
  effectiveFrom: '2025-09-01',
  effectiveUntil: null,
};

describe('attendance validity invariant (Task 007 §24)', () => {
  it('declares exactly the four V1 statuses', () => {
    expect(ATTENDANCE_STATUSES).toEqual(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
  });

  it('accepts an enrollment whose effective range covers the attendance date in the SAME Class', () => {
    expect(validateAttendanceContext(record, enrollment)).toEqual({ valid: true });
  });

  it('accepts an enrollment with an explicit effective_until covering the date', () => {
    const bounded: StudentEnrollmentContext = { ...enrollment, effectiveUntil: '2026-12-20' };
    expect(validateAttendanceContext(record, bounded)).toEqual({ valid: true });
  });

  it('accepts an enrollment with no effective_until for any date after effective_from', () => {
    const lateRecord: AttendanceRecordContext = { ...record, attendanceDate: '2026-06-20' };
    expect(validateAttendanceContext(lateRecord, enrollment)).toEqual({ valid: true });
  });

  it('rejects when the student has no enrollment covering the date', () => {
    expect(validateAttendanceContext(record, null)).toEqual({
      valid: false,
      reason: 'NO_ENROLLMENT',
    });
  });

  it('rejects an enrollment in a different Class', () => {
    const otherClass: StudentEnrollmentContext = { ...enrollment, classId: 'class-b' };
    expect(validateAttendanceContext(record, otherClass)).toEqual({
      valid: false,
      reason: 'CLASS_MISMATCH',
    });
  });

  it('rejects an enrollment in a different School', () => {
    const otherSchool: StudentEnrollmentContext = { ...enrollment, schoolId: 'school-b' };
    expect(validateAttendanceContext(record, otherSchool)).toEqual({
      valid: false,
      reason: 'SCHOOL_MISMATCH',
    });
  });

  it('rejects a date before the enrollment effective_from', () => {
    const earlyRecord: AttendanceRecordContext = { ...record, attendanceDate: '2025-08-31' };
    expect(validateAttendanceContext(earlyRecord, enrollment)).toEqual({
      valid: false,
      reason: 'BEFORE_EFFECTIVE_FROM',
    });
  });

  it('rejects a date after the enrollment effective_until', () => {
    const bounded: StudentEnrollmentContext = { ...enrollment, effectiveUntil: '2026-01-15' };
    const lateRecord: AttendanceRecordContext = { ...record, attendanceDate: '2026-02-01' };
    expect(validateAttendanceContext(lateRecord, bounded)).toEqual({
      valid: false,
      reason: 'AFTER_EFFECTIVE_UNTIL',
    });
  });

  it('validates a historical record against the ENDED enrollment that was in effect on the date', () => {
    // Student transferred from Class A to Class B on 2026-02-01. The old
    // attendance record for Class A on 2026-01-20 must remain valid — the
    // ENDED Class A enrollment still covers that date (Task 007 §7).
    const classAEnrollment: StudentEnrollmentContext = {
      schoolId: 'school-a',
      classId: 'class-a',
      effectiveFrom: '2025-09-01',
      effectiveUntil: '2026-01-31',
    };
    const historical: AttendanceRecordContext = { ...record, attendanceDate: '2026-01-20' };

    expect(validateAttendanceContext(historical, classAEnrollment)).toEqual({ valid: true });
  });

  it('rejects a record whose date is outside the ended enrollment range', () => {
    const classAEnrollment: StudentEnrollmentContext = {
      schoolId: 'school-a',
      classId: 'class-a',
      effectiveFrom: '2025-09-01',
      effectiveUntil: '2026-01-31',
    };
    const afterTransfer: AttendanceRecordContext = { ...record, attendanceDate: '2026-02-10' };

    expect(validateAttendanceContext(afterTransfer, classAEnrollment)).toEqual({
      valid: false,
      reason: 'AFTER_EFFECTIVE_UNTIL',
    });
  });
});