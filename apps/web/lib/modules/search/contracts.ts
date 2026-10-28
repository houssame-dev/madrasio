import { z } from 'zod';
import type { Role } from '@/lib/authorization/roles';

export const recordCategories = ['students', 'teachers', 'parents', 'classes', 'children'] as const;
export type RecordCategory = typeof recordCategories[number];
export type SearchCategory = 'all' | 'pages' | RecordCategory;
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  category: z.enum(['all', ...recordCategories]).default('all'),
}).strict();
export function searchCategories(role: Role): RecordCategory[] {
  if (role === 'SCHOOL_ADMIN') return ['students', 'teachers', 'parents', 'classes'];
  if (role === 'TEACHER') return ['students', 'classes'];
  if (role === 'PARENT') return ['children'];
  return [];
}
export interface SearchRecord { id: string; category: RecordCategory; name: string; detail: string | null; href: string }
export interface SearchResponse { data: SearchRecord[]; scope: { userId: string; schoolId: string; role: Role } }
