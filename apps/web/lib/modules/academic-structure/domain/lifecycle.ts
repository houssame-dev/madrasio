import { AcademicStructureError } from '../application/academic-structure-errors';

const transitions: Record<string, readonly string[]> = {
  'academic-year:PLANNED': ['ACTIVE'],
  'academic-year:ACTIVE': ['CLOSED'],
  'academic-year:CLOSED': ['ARCHIVED'],
  'period:PLANNED': ['ACTIVE'],
  'period:ACTIVE': ['CLOSED'],
  'curriculum:ACTIVE': ['INACTIVE', 'ARCHIVED'],
  'curriculum:INACTIVE': ['ACTIVE', 'ARCHIVED'],
  'curriculum-version:DRAFT': ['ACTIVE', 'ARCHIVED'],
  'curriculum-version:ACTIVE': ['ARCHIVED'],
  'class:ACTIVE': ['CLOSED'],
  'class:CLOSED': ['ARCHIVED'],
};

export function assertTransition(kind: string, current: string, next: string): void {
  if (current === next) return;
  if (!(transitions[`${kind}:${current}`] ?? []).includes(next)) {
    throw new AcademicStructureError(
      'INVALID_STATUS_TRANSITION',
      `Invalid ${kind} status transition from ${current} to ${next}.`,
    );
  }
}

export function assertDateRange(startDate: string, endDate: string): void {
  if (startDate >= endDate) {
    throw new AcademicStructureError('INVALID_ACADEMIC_CONTEXT', 'The start date must be before the end date.');
  }
}

export function assertPeriodInsideYear(
  period: { startDate: string; endDate: string },
  year: { startDate: string; endDate: string },
): void {
  assertDateRange(period.startDate, period.endDate);
  if (period.startDate < year.startDate || period.endDate > year.endDate) {
    throw new AcademicStructureError(
      'INVALID_ACADEMIC_CONTEXT',
      'Academic period dates must fall inside the academic year.',
    );
  }
}
