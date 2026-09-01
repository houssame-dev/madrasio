import { z } from 'zod';
import { parentCreateSchema, relationshipCreateSchema } from '@/lib/modules/parents/domain/contracts';
export const parentFormSchema = parentCreateSchema.omit({ parentCode: true, userId: true }).extend({ parentCode: z.string().trim().max(100).optional() });
export const relationshipFormSchema = relationshipCreateSchema;
export type ParentFormValues = z.input<typeof parentFormSchema>;
export type RelationshipFormValues = z.input<typeof relationshipFormSchema>;
