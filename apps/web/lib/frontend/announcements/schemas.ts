import { z } from 'zod';
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
export const announcementScheduleSchema = z.object({ scheduledAt: z.string().min(1, 'Choose a publication date and time.').refine((value) => !Number.isNaN(new Date(value).getTime()), 'Choose a valid publication date and time.') });
export type AnnouncementScheduleValues = z.infer<typeof announcementScheduleSchema>;
