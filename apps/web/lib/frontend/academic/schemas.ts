import { z } from 'zod';
import {
  academicPeriodCreateSchema, academicYearCreateSchema, classCreateSchema,
  curriculumCreateSchema, curriculumSubjectCreateSchema, curriculumVersionCreateSchema,
  levelCreateSchema, orderedStructureCreateSchema, subjectCreateSchema,
} from '@/lib/modules/academic-structure/domain/contracts';

const orderedDates = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.refine(
  (value) => String(value.startDate) < String(value.endDate),
  { path: ['endDate'], message: 'End date must be after start date.' },
);

export const yearFormSchema = orderedDates(academicYearCreateSchema.omit({ status: true }));
export const periodFormSchema = orderedDates(academicPeriodCreateSchema.omit({ status: true }));
export const orderedFormSchema = orderedStructureCreateSchema.omit({ status: true });
export const levelFormSchema = levelCreateSchema.omit({ status: true });
export const subjectFormSchema = subjectCreateSchema.omit({ status: true, code: true }).extend({
  code: z.string().trim().max(50).optional(),
});
export const curriculumFormSchema = curriculumCreateSchema.omit({ status: true });
export const versionFormSchema = curriculumVersionCreateSchema.omit({ status: true });
export const curriculumSubjectFormSchema = curriculumSubjectCreateSchema.omit({ status: true });
export const classFormSchema = classCreateSchema.omit({ status: true });

export type YearFormValues = z.input<typeof yearFormSchema>;
export type PeriodFormValues = z.input<typeof periodFormSchema>;
export type OrderedFormValues = z.input<typeof orderedFormSchema>;
export type LevelFormValues = z.input<typeof levelFormSchema>;
export type SubjectFormValues = z.input<typeof subjectFormSchema>;
export type CurriculumFormValues = z.input<typeof curriculumFormSchema>;
export type VersionFormValues = z.input<typeof versionFormSchema>;
export type CurriculumSubjectFormValues = z.input<typeof curriculumSubjectFormSchema>;
export type ClassFormValues = z.input<typeof classFormSchema>;
