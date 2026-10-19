import { z } from 'zod';
import { calendarDateSchema } from '@/lib/modules/teachers/domain/contracts';
import { minutes } from './contracts';

const uuid = z.string().uuid();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const draftContextSchema = z.object({ academicYearId: uuid, academicPeriodId: uuid, classId: uuid }).strict();
export const lessonSchema = z.object({ lessonKey: uuid, weekday: z.number().int().min(1).max(7), start: clock, end: clock,
  subjectId: uuid, teacherAssignmentId: uuid, roomId: uuid.nullable(),
}).strict().refine(l => minutes(l.start) < minutes(l.end), 'Lesson end must be after start.');
export const draftSchema = draftContextSchema.extend({ configurationId: uuid, curriculumVersionId: uuid, startDate: calendarDateSchema, endDate: calendarDateSchema,
  expectedRevision: z.number().int().nonnegative(), requestKey: uuid, lessons: z.array(lessonSchema).max(168),
}).strict().superRefine((value, ctx) => {
  if (value.startDate > value.endDate) ctx.addIssue({ code: 'custom', message: 'Invalid recurring date range.' });
  if (new Set(value.lessons.map(l => l.lessonKey)).size !== value.lessons.length) ctx.addIssue({ code: 'custom', message: 'Duplicate lesson identity.' });
});
export type Lesson = z.infer<typeof lessonSchema>;
export type DraftInput = z.infer<typeof draftSchema>;
export type DraftContext = z.infer<typeof draftContextSchema>;
export interface LessonIssue { lessonKey: string; kind: 'SLOT' | 'SUBJECT' | 'ASSIGNMENT' | 'ROOM' | 'DATE' }
interface References {
  subjects: { id: string; status: string }[]; curriculumSubjects: { subjectId: string; status: string }[];
  assignments: { id: string; subjectId: string; teacherId: string; status: string; effectiveFrom: string; effectiveUntil: string | null }[];
  teachers: { id: string; status: string }[]; rooms: { id: string; active: boolean }[];
}
export function validateLessons(lessons: Lesson[], c: References, configuration: { days: { day: number; slots: { kind: string; start: string; end: string }[] }[] } | null | undefined, startDate: string, endDate: string) {
  const issues: LessonIssue[] = [];
  for (const lesson of lessons) {
    const issue = (kind: LessonIssue['kind']) => issues.push({ lessonKey: lesson.lessonKey, kind });
    if (!configuration?.days.some(d => d.day === lesson.weekday && d.slots.some(s => s.kind === 'LESSON' && s.start === lesson.start && s.end === lesson.end))) issue('SLOT');
    const dates = occurrences(startDate, endDate, lesson.weekday);
    if (!dates) issue('DATE');
    if (!c.subjects.some(s => s.id === lesson.subjectId && s.status === 'ACTIVE') || !c.curriculumSubjects.some(s => s.subjectId === lesson.subjectId && s.status === 'ACTIVE')) issue('SUBJECT');
    const assignment = c.assignments.find(a => a.id === lesson.teacherAssignmentId && a.subjectId === lesson.subjectId && a.status === 'ACTIVE');
    if (!assignment || !c.teachers.some(t => t.id === assignment.teacherId && t.status === 'ACTIVE') || (dates && (assignment.effectiveFrom > dates.first || (assignment.effectiveUntil && assignment.effectiveUntil < dates.last)))) issue('ASSIGNMENT');
    if (lesson.roomId && !c.rooms.some(r => r.id === lesson.roomId && r.active)) issue('ROOM');
  }
  return issues;
}
export const clockTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const dayMillis = 86400000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / dayMillis;
const isoDay = (day: number) => ((day + 3) % 7 + 7) % 7 + 1;
export function occurrences(start: string, end: string, weekday: number): { first: string; last: string } | null {
  const from = dayNumber(start), to = dayNumber(end), first = from + (weekday - isoDay(from) + 7) % 7;
  if (first > to) return null;
  const last = to - (isoDay(to) - weekday + 7) % 7;
  return { first: new Date(first * dayMillis).toISOString().slice(0, 10), last: new Date(last * dayMillis).toISOString().slice(0, 10) };
}
export interface Reservation {
  lessonKey: string; classId: string; className: string; periodName: string; teacherId: string; roomId: string | null;
  weekday: number; start: string; end: string; startDate: string; endDate: string;
}
export interface SchedulingConflict { kind: 'CLASS' | 'TEACHER' | 'ROOM'; lessonKey: string; otherClass: string; otherPeriod: string; weekday: number; start: string; end: string }
export const conflictListSchema = z.array(z.object({ kind: z.enum(['CLASS', 'TEACHER', 'ROOM']), lessonKey: uuid, otherClass: z.string(), otherPeriod: z.string(), weekday: z.number().int().min(1).max(7), start: clock, end: clock }));
export function schedulingConflicts(candidates: Reservation[], existing: Reservation[]): SchedulingConflict[] {
  const conflicts: SchedulingConflict[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    for (const b of [...existing, ...candidates.slice(0, i)]) {
      if (a.weekday !== b.weekday || minutes(a.start) >= minutes(b.end) || minutes(b.start) >= minutes(a.end)) continue;
      const from = a.startDate > b.startDate ? a.startDate : b.startDate, to = a.endDate < b.endDate ? a.endDate : b.endDate;
      if (!occurrences(from, to, a.weekday)) continue;
      const kinds: SchedulingConflict['kind'][] = [];
      if (a.classId === b.classId) kinds.push('CLASS');
      if (a.teacherId === b.teacherId) kinds.push('TEACHER');
      if (a.roomId && a.roomId === b.roomId) kinds.push('ROOM');
      for (const kind of kinds) conflicts.push({ kind, lessonKey: a.lessonKey, otherClass: b.className, otherPeriod: b.periodName, weekday: b.weekday, start: b.start, end: b.end });
    }
  }
  return conflicts;
}
export interface LoadRequirement { subjectId: string; lessonsPerWeek: number; durationMinutes: number; enabled: boolean }
export function loadProgress(lessons: Lesson[], requirements: LoadRequirement[]) {
  const active = requirements.filter(r => r.enabled);
  return [...new Set([...active.map(r => r.subjectId), ...lessons.map(l => l.subjectId)])].map(subjectId => {
    const requirement = active.find(r => r.subjectId === subjectId), scheduled = lessons.filter(l => l.subjectId === subjectId);
    const scheduledMinutes = scheduled.reduce((sum, l) => sum + minutes(l.end) - minutes(l.start), 0);
    const required = requirement?.lessonsPerWeek ?? 0, requiredMinutes = required * (requirement?.durationMinutes ?? 0);
    return { subjectId, required, scheduled: scheduled.length, requiredMinutes, scheduledMinutes,
      status: !requirement ? 'UNCONFIGURED' as const : scheduled.length > required || scheduledMinutes > requiredMinutes ? 'EXCESS' as const : scheduled.length < required || scheduledMinutes < requiredMinutes ? 'INCOMPLETE' as const : 'COMPLETE' as const,
      durationMismatch: !!requirement && scheduled.some(l => minutes(l.end) - minutes(l.start) !== requirement.durationMinutes) };
  });
}
