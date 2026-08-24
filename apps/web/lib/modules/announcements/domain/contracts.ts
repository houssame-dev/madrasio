import { z } from 'zod';

const uuid = z.string().uuid();
const title = z.string().trim().min(1).max(300);
const body = z.string().trim().min(1).max(50_000);

export const announcementCreateSchema = z.object({ title, body }).strict();

export const announcementPatchSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
}).strict();

export const announcementVersionCreateSchema = z.object({ title, body }).strict();

const target = z.object({
  audience: z.enum(['PARENTS', 'TEACHERS']),
  targetType: z.enum(['SCHOOL', 'CLASS']),
  academicYearId: uuid,
  classId: uuid.optional(),
}).strict().superRefine((value, context) => {
  if (value.targetType === 'CLASS' && !value.classId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'CLASS targets require classId.' });
  }
  if (value.targetType === 'SCHOOL' && value.classId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'SCHOOL targets cannot include classId.' });
  }
});

export const announcementTargetsCreateSchema = z.object({
  announcementVersionId: uuid,
  targets: z.array(target).min(1).max(100),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.targets.forEach((item, index) => {
    const key = [item.audience, item.targetType, item.classId ?? 'SCHOOL'].join(':');
    if (seen.has(key)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targets', index],
      message: 'Each logical target may appear only once.',
    });
    seen.add(key);
  });
});

export const announcementPublishSchema = z.object({
  announcementVersionId: uuid,
  idempotencyKey: uuid,
  scheduledAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export type AnnouncementCreateInput = z.output<typeof announcementCreateSchema>;
export type AnnouncementPatchInput = z.output<typeof announcementPatchSchema>;
export type AnnouncementVersionCreateInput = z.output<typeof announcementVersionCreateSchema>;
export type AnnouncementTargetsCreateInput = z.output<typeof announcementTargetsCreateSchema>;
export type AnnouncementPublishRequest = z.output<typeof announcementPublishSchema>;

export interface PageInput { page: number; pageSize: number }
export interface AnnouncementListInput extends PageInput {
  status?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  audience?: 'PARENTS' | 'TEACHERS';
  targetType?: 'SCHOOL' | 'CLASS';
  classId?: string;
  publicationStatus?: 'SCHEDULED' | 'PUBLISHED';
  createdFrom?: Date;
  createdTo?: Date;
  search?: string;
}
