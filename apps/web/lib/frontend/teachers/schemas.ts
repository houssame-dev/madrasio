import { z } from 'zod';
import {
  assignmentCreateSchema, endAssignmentSchema, teacherCreateSchema,
} from '@/lib/modules/teachers/domain/contracts';

export const teacherFormSchema = teacherCreateSchema.omit({ teacherCode: true, userId: true }).extend({
  teacherCode: z.string().trim().max(100).optional(),
  userId: z.union([z.literal(''), z.string().uuid('Enter a valid User UUID.')]).optional(),
});
export const assignmentFormSchema = assignmentCreateSchema;
export const endAssignmentFormSchema = endAssignmentSchema;

export type TeacherFormValues = z.input<typeof teacherFormSchema>;
export type AssignmentFormValues = z.input<typeof assignmentFormSchema>;
export type EndAssignmentFormValues = z.input<typeof endAssignmentFormSchema>;
