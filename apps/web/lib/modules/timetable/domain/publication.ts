import { z } from 'zod';
import { calendarDateSchema } from '@/lib/modules/teachers/domain/contracts';
import type { TimetablePublicationSnapshot } from '@school/database';

export const publishSchema = z.object({ academicYearId: z.string().uuid(), academicPeriodId: z.string().uuid(), classId: z.string().uuid(),
  draftId: z.string().uuid(), expectedRevision: z.number().int().positive(), expectedSequence: z.number().int().nonnegative(),
  effectiveFrom: calendarDateSchema, requestKey: z.string().uuid(), confirm: z.literal(true) }).strict();
export const publishedQuerySchema = z.object({ date: calendarDateSchema.optional(), classId: z.string().uuid().optional(), teacherId: z.string().uuid().optional(), studentId: z.string().uuid().optional() }).strict()
  .refine(v => [v.classId, v.teacherId, v.studentId].filter(Boolean).length <= 1);
export interface PublicationRange { id: string; classId: string; academicYearId: string; sequence: number; effectiveFrom: string; validUntil: string; snapshot: TimetablePublicationSnapshot }
export const previousDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
/** Derive replacements without mutating historical events. Context end is an inclusive hard bound. */
export function publicationRanges<T extends PublicationRange>(events: T[]) {
  return events.map(event => {
    const next = events.filter(v => v.classId === event.classId && v.effectiveFrom > event.effectiveFrom).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    const until = next && previousDate(next.effectiveFrom) < event.validUntil ? previousDate(next.effectiveFrom) : event.validUntil;
    return { ...event, effectiveUntil: until };
  });
}
export function applicablePublications<T extends PublicationRange>(events: T[], date: string) {
  return publicationRanges(events).filter(v => v.effectiveFrom <= date && v.effectiveUntil >= date);
}
