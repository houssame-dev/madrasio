import { expect, it } from 'vitest';
import { daysSchema, configurationSchema, effectiveConfiguration, loadSchema } from '@/lib/modules/timetable/domain/contracts';
const days = [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'BREAK', start: '09:00', end: '09:15' }] }];
it('accepts explicit days, breaks, gaps and different day times', () => {
  expect(daysSchema.safeParse([...days, { day: 6, slots: [{ kind: 'LESSON', start: '10:30', end: '11:15' }] }]).success).toBe(true);
});
it.each([
  [], [...days, ...days], [{ day: 0, slots: days[0].slots }], [{ day: 1, slots: [] }],
  [{ day: 1, slots: [{ kind: 'BREAK', start: '08:00', end: '09:00' }] }],
  [{ day: 1, slots: [{ kind: 'LESSON', start: '09:00', end: '08:00' }] }],
  [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '08:00' }] }],
  [{ day: 1, slots: [{ kind: 'LESSON', start: '24:00', end: '25:00' }] }],
  [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '10:00' }, { kind: 'BREAK', start: '09:00', end: '10:00' }] }],
])('rejects malformed or overlapping teaching weeks %#', raw => { expect(daysSchema.safeParse(raw).success).toBe(false); });
it('uses a complete Level > Stage > School override and skips retired overrides', () => {
  const school = { scopeKey: 'school', enabled: true, days: [] }, stage = { scopeKey: 'stage:s', enabled: true, days: [] }, level = { scopeKey: 'level:l', enabled: true, days: [] };
  expect(effectiveConfiguration([school, stage, level], 's', 'l')).toBe(level);
  expect(effectiveConfiguration([school, stage, { ...level, enabled: false }], 's', 'l')).toBe(stage);
  expect(effectiveConfiguration([school], 's', 'l')).toBe(school);
  expect(effectiveConfiguration([], 's', 'l')).toBeUndefined();
});
it('rejects injected authority, disabling the school default and invalid loads', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const config = { academicYearId: id, expectedRevision: 0, days };
  expect(configurationSchema.safeParse(config).success).toBe(true);
  for (const input of [{ ...config, schoolId: id }, { ...config, stageId: id, levelId: id }, { ...config, enabled: false }]) expect(configurationSchema.safeParse(input).success).toBe(false);
  expect(loadSchema.safeParse({ academicYearId: id, classId: id, subjectId: id, teacherAssignmentId: id, roomId: null, lessonsPerWeek: 2.5, durationMinutes: 60, expectedRevision: 0, enabled: true }).success).toBe(false);
});
