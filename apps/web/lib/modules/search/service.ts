import 'server-only';
import { and, asc, eq, exists, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import * as s from '@school/database';
import { schoolDateFromInstant } from '@school/shared';
import { requireOperation, resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import type { AuthDb } from '@/lib/auth/current-context';
import { ForbiddenError } from '@/lib/errors';
import { searchCategories, searchQuerySchema, type SearchRecord, type SearchResponse } from './contracts';

/** Read-only bounded projection. No directory rows, totals, emails or private metadata leave this boundary. */
export async function searchRecords(db: AuthDb, actor: { userId: string | null; schoolId: string }, raw: unknown, now = new Date()): Promise<SearchResponse> {
  const input = searchQuerySchema.parse(raw);
  return db.transaction(async tx => {
    const auth = tx as unknown as AuthorizationDb;
    await requireOperation(auth, actor, { scope: { kind: 'school' } });
    const context = await resolveCurrentContext(auth, actor), role = context.role!;
    const categories = searchCategories(role);
    if (!categories.length || (input.category !== 'all' && !categories.includes(input.category))) throw new ForbiddenError();
    const [school] = await tx.select({ status: s.schools.status, timezone: s.schools.timezone }).from(s.schools).where(eq(s.schools.id, actor.schoolId));
    if (school?.status !== 'ACTIVE') throw new ForbiddenError();
    const date = schoolDateFromInstant(now, school.timezone);
    const selected = input.category === 'all' ? categories : [input.category];
    const pattern = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
    const data: SearchRecord[] = [];
    const a = s.teacherAssignments, e = s.studentEnrollments, t = s.teachers, c = s.classes;
    const assignment = and(eq(a.schoolId, actor.schoolId), eq(a.status, 'ACTIVE'), lte(a.effectiveFrom, date), or(isNull(a.effectiveUntil), gte(a.effectiveUntil, date)), eq(t.schoolId, actor.schoolId), eq(t.userId, actor.userId!), eq(t.status, 'ACTIVE'));
    for (const category of selected) {
      const permission = category === 'students' ? 'students.read' : category === 'classes' ? 'academic_structure.read' : category === 'teachers' ? 'teachers.read' : 'parents.read';
      await requireOperation(auth, actor, { permission, scope: { kind: 'school' } });
      if (category === 'students' || category === 'children') {
        const childScope = exists(tx.select({ id: s.parentStudents.id }).from(s.parentStudents).innerJoin(s.parents, eq(s.parents.id, s.parentStudents.parentId)).where(and(eq(s.parentStudents.schoolId, actor.schoolId), eq(s.parentStudents.studentId, s.students.id), eq(s.parentStudents.status, 'ACTIVE'), eq(s.parents.schoolId, actor.schoolId), eq(s.parents.userId, actor.userId!), eq(s.parents.status, 'ACTIVE'))));
        const teacherScope = exists(tx.select({ id: e.id }).from(e).innerJoin(a, and(eq(a.classId, e.classId), eq(a.academicYearId, e.academicYearId))).innerJoin(t, eq(t.id, a.teacherId)).innerJoin(c, eq(c.id, e.classId)).where(and(assignment, eq(c.schoolId, actor.schoolId), eq(c.status, 'ACTIVE'), eq(e.schoolId, actor.schoolId), eq(e.studentId, s.students.id), eq(e.status, 'ACTIVE'), lte(e.effectiveFrom, date), or(isNull(e.effectiveUntil), gte(e.effectiveUntil, date)))));
        const rows = await tx.select({ id: s.students.id, first: s.students.firstName, last: s.students.lastName, code: s.students.studentCode }).from(s.students).where(and(eq(s.students.schoolId, actor.schoolId), or(ilike(sql`${s.students.firstName} || ' ' || ${s.students.lastName}`, pattern), ilike(s.students.studentCode, pattern)), category === 'children' ? childScope : role === 'TEACHER' ? and(eq(s.students.status, 'ACTIVE'), teacherScope) : undefined)).orderBy(asc(s.students.lastName), asc(s.students.firstName), asc(s.students.id)).limit(6);
        data.push(...rows.map(row => ({ id: row.id, category, name: `${row.first} ${row.last}`, detail: row.code, href: `/${category === 'children' ? 'children' : 'students'}/${row.id}` })));
      } else if (category === 'classes') {
        const assigned = exists(tx.select({ id: a.id }).from(a).innerJoin(t, eq(t.id, a.teacherId)).where(and(assignment, eq(a.classId, c.id), eq(a.academicYearId, c.academicYearId))));
        const rows = await tx.select({ id: c.id, name: c.name, yearId: c.academicYearId, year: s.academicYears.name }).from(c).innerJoin(s.academicYears, and(eq(s.academicYears.id, c.academicYearId), eq(s.academicYears.schoolId, actor.schoolId))).where(and(eq(c.schoolId, actor.schoolId), ilike(c.name, pattern), role === 'TEACHER' ? and(eq(c.status, 'ACTIVE'), assigned) : undefined)).orderBy(asc(c.name), asc(c.id)).limit(6);
        data.push(...rows.map(row => ({ id: row.id, category, name: row.name, detail: row.year, href: `/academic?${new URLSearchParams({ section: 'classes', yearId: row.yearId, search: row.name })}` })));
      } else {
        // These two branches are School Admin-only by the independently verified category allowlist.
        const table = category === 'teachers' ? s.teachers : s.parents;
        const rows = await tx.select({ id: table.id, first: table.firstName, last: table.lastName }).from(table).where(and(eq(table.schoolId, actor.schoolId), ilike(sql`${table.firstName} || ' ' || ${table.lastName}`, pattern))).orderBy(asc(table.lastName), asc(table.firstName), asc(table.id)).limit(6);
        data.push(...rows.map(row => ({ id: row.id, category, name: `${row.first} ${row.last}`, detail: null, href: `/${category}/${row.id}` })));
      }
    }
    return { data, scope: { userId: actor.userId!, schoolId: actor.schoolId, role } };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
