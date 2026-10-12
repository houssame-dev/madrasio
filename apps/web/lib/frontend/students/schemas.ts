import { z } from 'zod';
import {
  dateOfBirthSchema, endEnrollmentSchema, enrollmentCreateSchema, studentCreateSchema, transferStudentSchema,
} from '@/lib/modules/students/domain/contracts';

const studentFormFields = studentCreateSchema.omit({ studentCode: true }).extend({
  dateOfBirth: z.string(),
  studentCode: z.string().trim().max(100).optional(),
});
export function studentFormSchemaFor(editing: boolean, hasDateOfBirth: boolean) {
  return studentFormFields.superRefine((value, context) => {
    if (editing && !hasDateOfBirth && value.dateOfBirth === '') return;
    if (!dateOfBirthSchema.safeParse(value.dateOfBirth).success) {
      context.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Choose a valid date of birth (YYYY-MM-DD).' });
    }
  });
}
export const studentFormSchema = studentFormSchemaFor(false, false);
export const enrollmentFormSchema = enrollmentCreateSchema;
export const transferFormSchema = transferStudentSchema;
export const endEnrollmentFormSchema = endEnrollmentSchema;

export type StudentFormValues = z.input<typeof studentFormSchema>;
export type EnrollmentFormValues = z.input<typeof enrollmentFormSchema>;
export type TransferFormValues = z.input<typeof transferFormSchema>;
export type EndEnrollmentFormValues = z.input<typeof endEnrollmentFormSchema>;
