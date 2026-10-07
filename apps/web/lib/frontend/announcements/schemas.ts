import { z } from 'zod';
import { schoolWallTimeToInstant } from '@school/shared';
export const announcementStatuses = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
export const announcementAudiences = ['PARENTS', 'TEACHERS'] as const;
export const announcementTargetTypes = ['SCHOOL', 'CLASS'] as const;
export const announcementContentSchema = z.object({ title: z.string().trim().min(1, 'Title is required.').max(300), body: z.string().trim().min(1, 'Body is required.').max(50_000) });
export type AnnouncementContentValues = z.infer<typeof announcementContentSchema>;
export const announcementTargetSchema = z.object({ audience: z.enum(announcementAudiences), targetType: z.enum(announcementTargetTypes), academicYearId: z.string().uuid('Choose a valid Academic Year.'), classId: z.string().optional() }).superRefine((value, context) => {
  if (value.targetType === 'CLASS' && !z.string().uuid().safeParse(value.classId).success) context.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Choose a valid Class.' });
  if (value.targetType === 'SCHOOL' && value.classId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'School-wide targets cannot include a Class.' });
});
export type AnnouncementTargetValues = z.infer<typeof announcementTargetSchema>;
export const announcementScheduleSchema = (timezone: string) => z.object({ scheduledAt: z.string().min(1, 'Choose a publication date and time.').refine((value) => {
  try { schoolWallTimeToInstant(value, timezone); return true; } catch { return false; }
}, 'Choose an unambiguous, valid date and time in the School timezone. Skipped or repeated clock times are not allowed.') });
export type AnnouncementScheduleValues = z.infer<ReturnType<typeof announcementScheduleSchema>>;
