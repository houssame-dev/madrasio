import { expect, it } from 'vitest';
import { applicablePublications, publicationRanges, publishSchema } from '@/lib/modules/timetable/domain/publication';
const snapshot = { className: 'A', yearName: 'Year', periodName: 'Term', timezone: 'Africa/Casablanca', lessons: [] };
const event = (sequence: number, effectiveFrom: string, validUntil = '2026-07-01') => ({ id: String(sequence), classId: 'A', academicYearId: 'Y', sequence, effectiveFrom, validUntil, snapshot });
it('derives inclusive boundaries and gaps without modifying immutable events', () => {
  const input = [event(1, '2026-01-01'), event(2, '2026-02-01')], original = structuredClone(input);
  expect(publicationRanges(input)[0].effectiveUntil).toBe('2026-01-31');
  expect(applicablePublications(input, '2026-01-31')[0].sequence).toBe(1); expect(applicablePublications(input, '2026-02-01')[0].sequence).toBe(2);
  expect(applicablePublications(input, '2026-07-02')).toEqual([]); expect(input).toEqual(original);
  expect(applicablePublications([event(1, '2026-01-01', '2026-01-20'), event(2, '2026-02-01')], '2026-01-21')).toEqual([]);
});
it('rejects unconfirmed or injected publication authority and invalid dates', () => {
  expect(publishSchema.safeParse({ confirm: false }).success).toBe(false);
  expect(publishSchema.safeParse({ confirm: true, effectiveFrom: '2026-02-30', schoolId: 'injected' }).success).toBe(false);
});
