import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const code = z.string().trim().min(1).max(100).nullable().optional();
const uuid = z.string().uuid();

export const parentCreateSchema = z.object({
  firstName: name,
  lastName: name,
  parentCode: code,
  userId: uuid.nullable().optional(),
}).strict();

export const parentPatchSchema = z.object({
  firstName: name.optional(),
  lastName: name.optional(),
  parentCode: code,
  userId: uuid.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
}).strict();

export const relationshipCreateSchema = z.object({ studentId: uuid }).strict();
export const endRelationshipSchema = z.object({}).strict();

export type ParentCreate = z.output<typeof parentCreateSchema>;
export type ParentPatch = z.output<typeof parentPatchSchema>;
export type RelationshipCreate = z.output<typeof relationshipCreateSchema>;
export interface PageInput { page: number; pageSize: number }
export interface PageResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
