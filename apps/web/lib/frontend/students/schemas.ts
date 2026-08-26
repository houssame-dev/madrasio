import { z } from 'zod';
import {
  endEnrollmentSchema, enrollmentCreateSchema, studentCreateSchema, transferStudentSchema,
} from '@/lib/modules/students/domain/contracts';

export const studentFormSchema = studentCreateSchema.omit({ studentCode: true }).extend({
  studentCode: z.string().trim().max(100).optional(),
});
export const enrollmentFormSchema = enrollmentCreateSchema;
export const transferFormSchema = transferStudentSchema;
export const endEnrollmentFormSchema = endEnrollmentSchema;

export type StudentFormValues = z.input<typeof studentFormSchema>;
export type EnrollmentFormValues = z.input<typeof enrollmentFormSchema>;
export type TransferFormValues = z.input<typeof transferFormSchema>;
export type EndEnrollmentFormValues = z.input<typeof endEnrollmentFormSchema>;
