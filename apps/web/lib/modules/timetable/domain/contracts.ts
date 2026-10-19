import { z } from 'zod';
import type { TimetableDay } from '@school/database';

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const daysSchema = z.array(z.object({ day: z.number().int().min(1).max(7), slots: z.array(z.object({
  kind: z.enum(['LESSON', 'BREAK']), start: time, end: time,
}).strict()).min(1).max(24) }).strict()).min(1).max(7).superRefine((days, ctx) => {
  if (new Set(days.map(d => d.day)).size !== days.length) ctx.addIssue({ code: 'custom', message: 'Duplicate working day.' });
  for (const day of days) {
    if (!day.slots.some(s => s.kind === 'LESSON')) ctx.addIssue({ code: 'custom', message: 'Each working day needs a teaching slot.' });
    let previous = -1;
    for (const slot of day.slots) {
      if (minutes(slot.start) < previous || minutes(slot.end) <= minutes(slot.start)) ctx.addIssue({ code: 'custom', message: 'Slots must be ordered, non-overlapping, same-day intervals.' });
      previous = minutes(slot.end);
    }
  }
});
export const configurationSchema = z.object({ academicYearId: uuid, stageId: uuid.nullable().default(null), levelId: uuid.nullable().default(null),
  expectedRevision: z.number().int().nonnegative(), enabled: z.boolean().default(true), days: daysSchema,
}).strict().refine(v => !v.stageId || !v.levelId, 'Choose one override scope.').refine(v => v.enabled || v.stageId || v.levelId, 'School default cannot be disabled.');
export const roomSchema = z.object({ id: uuid.optional(), expectedRevision: z.number().int().nonnegative(), name: z.string().trim().min(1).max(100), kind: z.enum(['ROOM', 'LAB']), active: z.boolean() }).strict();
export const loadSchema = z.object({ academicYearId: uuid, classId: uuid, subjectId: uuid, teacherAssignmentId: uuid, roomId: uuid.nullable(),
  lessonsPerWeek: z.number().int().min(1).max(60), durationMinutes: z.number().int().min(5).max(240), expectedRevision: z.number().int().nonnegative(), enabled: z.boolean(),
}).strict();

export interface ConfigurationScope { scopeKey: string; enabled: boolean; days: TimetableDay[] }
/** Complete replacement, never a merge of incompatible slot indexes. Input contains latest revisions only. */
export function effectiveConfiguration<T extends ConfigurationScope>(rows: T[], stageId: string, levelId: string): T | undefined {
  return [`level:${levelId}`, `stage:${stageId}`, 'school'].map(key => rows.find(r => r.scopeKey === key && r.enabled)).find(Boolean);
}
