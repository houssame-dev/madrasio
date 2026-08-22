import { and, asc, count, desc, eq, exists, ilike, or, type SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type ParentsDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }
export interface ParentFilters {
  status?: typeof schema.parentStatus.enumValues[number];
  parentCode?: string;
  search?: string;
  studentId?: string;
}
export interface RelationshipFilters {
  status?: typeof schema.parentStudentStatus.enumValues[number];
  studentId?: string;
}

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

export async function listParents(
  db: ParentsDb,
  schoolId: string,
  paging: Paging,
  filters: ParentFilters,
) {
  const condition = where([
    eq(schema.parents.schoolId, schoolId),
    filters.status ? eq(schema.parents.status, filters.status) : undefined,
    filters.parentCode ? eq(schema.parents.parentCode, filters.parentCode) : undefined,
    filters.search ? or(
      ilike(schema.parents.firstName, `%${filters.search}%`),
      ilike(schema.parents.lastName, `%${filters.search}%`),
      ilike(schema.parents.parentCode, `%${filters.search}%`),
    ) : undefined,
    filters.studentId ? exists(
      db.select({ id: schema.parentStudents.id }).from(schema.parentStudents).where(and(
        eq(schema.parentStudents.schoolId, schoolId),
        eq(schema.parentStudents.parentId, schema.parents.id),
        eq(schema.parentStudents.studentId, filters.studentId),
        eq(schema.parentStudents.status, 'ACTIVE'),
      )),
    ) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.parents).where(condition)
      .orderBy(asc(schema.parents.lastName), asc(schema.parents.firstName), asc(schema.parents.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.parents).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findParent(db: ParentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.parents).where(and(
    eq(schema.parents.schoolId, schoolId), eq(schema.parents.id, id),
  )).limit(1);
  return row ?? null;
}

export async function insertParent(
  db: ParentsDb,
  schoolId: string,
  input: Omit<typeof schema.parents.$inferInsert, 'schoolId'>,
) {
  const [row] = await db.insert(schema.parents).values({ ...input, schoolId }).returning();
  return row;
}

export async function updateParent(
  db: ParentsDb,
  schoolId: string,
  id: string,
  input: Partial<typeof schema.parents.$inferInsert>,
) {
  const [row] = await db.update(schema.parents).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.parents.schoolId, schoolId), eq(schema.parents.id, id))).returning();
  return row ?? null;
}

export async function findUser(db: ParentsDb, id: string) {
  const [row] = await db.select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}

export async function findMembership(db: ParentsDb, schoolId: string, userId: string) {
  const [row] = await db.select({
    id: schema.schoolMemberships.id,
    status: schema.schoolMemberships.status,
    role: schema.schoolMemberships.role,
  }).from(schema.schoolMemberships).where(and(
    eq(schema.schoolMemberships.schoolId, schoolId),
    eq(schema.schoolMemberships.userId, userId),
  )).limit(1);
  return row ?? null;
}

export async function findStudent(db: ParentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.students).where(and(
    eq(schema.students.schoolId, schoolId), eq(schema.students.id, id),
  )).limit(1);
  return row ?? null;
}

export async function listRelationships(
  db: ParentsDb,
  schoolId: string,
  parentId: string,
  paging: Paging,
  filters: RelationshipFilters,
) {
  const condition = where([
    eq(schema.parentStudents.schoolId, schoolId),
    eq(schema.parentStudents.parentId, parentId),
    filters.status ? eq(schema.parentStudents.status, filters.status) : undefined,
    filters.studentId ? eq(schema.parentStudents.studentId, filters.studentId) : undefined,
  ]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.parentStudents).where(condition)
      .orderBy(desc(schema.parentStudents.createdAt), desc(schema.parentStudents.id))
      .limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.parentStudents).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findRelationship(db: ParentsDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.parentStudents).where(and(
    eq(schema.parentStudents.schoolId, schoolId), eq(schema.parentStudents.id, id),
  )).limit(1);
  return row ?? null;
}

export async function findActiveRelationship(
  db: ParentsDb,
  schoolId: string,
  parentId: string,
  studentId: string,
) {
  const [row] = await db.select().from(schema.parentStudents).where(and(
    eq(schema.parentStudents.schoolId, schoolId),
    eq(schema.parentStudents.parentId, parentId),
    eq(schema.parentStudents.studentId, studentId),
    eq(schema.parentStudents.status, 'ACTIVE'),
  )).limit(1);
  return row ?? null;
}

export async function insertRelationship(
  db: ParentsDb,
  input: typeof schema.parentStudents.$inferInsert,
) {
  const [row] = await db.insert(schema.parentStudents).values(input).returning();
  return row;
}

export async function endRelationshipIfActive(db: ParentsDb, schoolId: string, id: string) {
  const [row] = await db.update(schema.parentStudents)
    .set({ status: 'ENDED', updatedAt: new Date() })
    .where(and(
      eq(schema.parentStudents.schoolId, schoolId),
      eq(schema.parentStudents.id, id),
      eq(schema.parentStudents.status, 'ACTIVE'),
    )).returning();
  return row ?? null;
}
