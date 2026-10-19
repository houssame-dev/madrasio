import { expect, it } from 'vitest';
import { draftSchema, loadProgress, occurrences, schedulingConflicts, validateLessons, type Reservation } from '@/lib/modules/timetable/domain/builder';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a: Reservation = { lessonKey: id(1), classId: id(2), className: 'A', periodName: 'Term', teacherId: id(3), roomId: id(4), weekday: 1, start: '08:00', end: '09:00', startDate: '2025-01-06', endDate: '2025-03-31' };
it('detects actual clock overlap across different timetable period numbers', () => {
  const conflicts = schedulingConflicts([a], [{ ...a, classId: id(5), start: '08:30', end: '09:30' }]);
  expect(conflicts.map(c => c.kind)).toEqual(['TEACHER', 'ROOM']);
});
it('detects a Class overlap even with different Teachers and no room', () => {
  expect(schedulingConflicts([a], [{ ...a, teacherId: id(9), roomId: null }]).map(c => c.kind)).toEqual(['CLASS']);
});
it('detects room-only overlap and internal candidate overlaps', () => {
  expect(schedulingConflicts([a], [{ ...a, classId: id(5), teacherId: id(9) }]).map(c => c.kind)).toEqual(['ROOM']);
  expect(schedulingConflicts([a, { ...a, lessonKey: id(9) }], []).map(c => c.kind)).toEqual(['CLASS', 'TEACHER', 'ROOM']);
});
it.each([
  { start: '09:00', end: '10:00' }, { start: '07:00', end: '08:00' }, { weekday: 2 },
  { startDate: '2025-04-01', endDate: '2025-05-01' }, { startDate: '2025-01-07', endDate: '2025-01-10' },
])('allows adjacency, other days and non-occurring date intersections %#', patch => {
  expect(schedulingConflicts([{ ...a, startDate: '2025-01-06', endDate: '2025-01-12' }], [{ ...a, ...patch }])).toEqual([]);
});
it('computes first/last recurring dates across calendar years without a timezone shift', () => {
  expect(occurrences('2025-12-30', '2026-01-12', 1)).toEqual({ first: '2026-01-05', last: '2026-01-12' });
  expect(occurrences('2025-01-07', '2025-01-10', 1)).toBeNull();
});
const lesson = { lessonKey: id(1), weekday: 1, start: '08:00', end: '09:00', subjectId: id(2), teacherAssignmentId: id(3), roomId: null };
it('keeps load warnings separate from hard conflicts and measures actual minutes', () => {
  const requirements = [{ subjectId: id(2), lessonsPerWeek: 2, durationMinutes: 60, enabled: true }];
  expect(loadProgress([lesson], requirements)[0]).toMatchObject({ required: 2, scheduled: 1, status: 'INCOMPLETE' });
  expect(loadProgress([lesson, { ...lesson, weekday: 2 }], requirements)[0].status).toBe('COMPLETE');
  expect(loadProgress([lesson, lesson, lesson], requirements)[0].status).toBe('EXCESS');
  expect(loadProgress([{ ...lesson, end: '08:45' }], [{ ...requirements[0], lessonsPerWeek: 1 }])[0]).toMatchObject({ status: 'INCOMPLETE', durationMismatch: true, scheduledMinutes: 45 });
  expect(loadProgress([lesson], [])[0].status).toBe('UNCONFIGURED');
});
it('requires assignment eligibility for actual occurrences, not unrelated days at the Period edges', () => {
  const refs = { subjects: [{ id: id(2), status: 'ACTIVE' }], curriculumSubjects: [{ subjectId: id(2), status: 'ACTIVE' }],
    assignments: [{ id: id(3), subjectId: id(2), teacherId: id(4), status: 'ACTIVE', effectiveFrom: '2025-01-06', effectiveUntil: '2025-01-13' }], teachers: [{ id: id(4), status: 'ACTIVE' }], rooms: [] };
  const config = { days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }] };
  expect(validateLessons([lesson], refs, config, '2025-01-01', '2025-01-15')).toEqual([]);
  expect(validateLessons([lesson], refs, config, '2025-01-01', '2025-01-20')).toContainEqual({ lessonKey: id(1), kind: 'ASSIGNMENT' });
});
it('strictly rejects malformed, duplicate and authority-bearing drafts', () => {
  const input = { academicYearId: id(1), academicPeriodId: id(2), classId: id(3), configurationId: id(4), curriculumVersionId: id(5), startDate: '2025-01-01', endDate: '2025-03-31', requestKey: id(6), expectedRevision: 0, lessons: [lesson] };
  expect(draftSchema.safeParse(input).success).toBe(true);
  for (const body of [{ ...input, schoolId: id(8) }, { ...input, startDate: '2025-02-30' }, { ...input, lessons: [lesson, lesson] }, { ...input, lessons: [{ ...lesson, end: '08:00' }] }]) expect(draftSchema.safeParse(body).success).toBe(false);
});
