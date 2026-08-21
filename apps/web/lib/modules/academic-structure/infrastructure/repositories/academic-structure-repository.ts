import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';

export type AcademicStructureDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Paging { limit: number; offset: number }

function where(conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions.filter((condition): condition is SQL => condition !== undefined));
}

export async function listAcademicYears(db: AcademicStructureDb, schoolId: string, paging: Paging, status?: typeof schema.academicYearStatus.enumValues[number]) {
  const condition = where([eq(schema.academicYears.schoolId, schoolId), status ? eq(schema.academicYears.status, status) : undefined]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.academicYears).where(condition).orderBy(desc(schema.academicYears.createdAt), desc(schema.academicYears.id)).limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.academicYears).where(condition),
  ]);
  return { rows, total: totals[0]?.value ?? 0 };
}

export async function findAcademicYear(db: AcademicStructureDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.academicYears).where(and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, id))).limit(1);
  return row ?? null;
}

export async function insertAcademicYear(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.academicYears.$inferInsert, 'schoolId'>) {
  const [row] = await db.insert(schema.academicYears).values({ ...input, schoolId }).returning(); return row;
}
export async function updateAcademicYear(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.academicYears.$inferInsert>) {
  const [row] = await db.update(schema.academicYears).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.academicYears.schoolId, schoolId), eq(schema.academicYears.id, id))).returning(); return row ?? null;
}

export async function listAcademicPeriods(db: AcademicStructureDb, schoolId: string, academicYearId: string, paging: Paging, status?: typeof schema.academicPeriodStatus.enumValues[number]) {
  const condition = where([eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.academicYearId, academicYearId), status ? eq(schema.academicPeriods.status, status) : undefined]);
  const [rows, totals] = await Promise.all([
    db.select().from(schema.academicPeriods).where(condition).orderBy(asc(schema.academicPeriods.sequence), asc(schema.academicPeriods.id)).limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.academicPeriods).where(condition),
  ]); return { rows, total: totals[0]?.value ?? 0 };
}
export async function findAcademicPeriod(db: AcademicStructureDb, schoolId: string, id: string) {
  const [row] = await db.select().from(schema.academicPeriods).where(and(eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.id, id))).limit(1); return row ?? null;
}
export async function findPeriodsForYear(db: AcademicStructureDb, schoolId: string, academicYearId: string) {
  return db.select().from(schema.academicPeriods).where(and(eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.academicYearId, academicYearId)));
}
export async function insertAcademicPeriod(db: AcademicStructureDb, schoolId: string, academicYearId: string, input: Omit<typeof schema.academicPeriods.$inferInsert, 'schoolId' | 'academicYearId'>) {
  const [row] = await db.insert(schema.academicPeriods).values({ ...input, schoolId, academicYearId }).returning(); return row;
}
export async function updateAcademicPeriod(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.academicPeriods.$inferInsert>) {
  const [row] = await db.update(schema.academicPeriods).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.academicPeriods.schoolId, schoolId), eq(schema.academicPeriods.id, id))).returning(); return row ?? null;
}

export async function listStages(db: AcademicStructureDb, schoolId: string, paging: Paging, status?: typeof schema.stageStatus.enumValues[number]) {
  const condition = where([eq(schema.stages.schoolId, schoolId), status ? eq(schema.stages.status, status) : undefined]);
  const [rows, totals] = await Promise.all([db.select().from(schema.stages).where(condition).orderBy(asc(schema.stages.sequence), asc(schema.stages.name), asc(schema.stages.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.stages).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findStage(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.stages).where(and(eq(schema.stages.schoolId, schoolId), eq(schema.stages.id, id))).limit(1); return row ?? null; }
export async function insertStage(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.stages.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.stages).values({ ...input, schoolId }).returning(); return row; }
export async function updateStage(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.stages.$inferInsert>) { const [row] = await db.update(schema.stages).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.stages.schoolId, schoolId), eq(schema.stages.id, id))).returning(); return row ?? null; }

export async function listLevels(db: AcademicStructureDb, schoolId: string, paging: Paging, filters: { status?: typeof schema.levelStatus.enumValues[number]; stageId?: string }) {
  const condition = where([eq(schema.levels.schoolId, schoolId), filters.status ? eq(schema.levels.status, filters.status) : undefined, filters.stageId ? eq(schema.levels.stageId, filters.stageId) : undefined]);
  const [rows, totals] = await Promise.all([db.select().from(schema.levels).where(condition).orderBy(asc(schema.levels.sequence), asc(schema.levels.name), asc(schema.levels.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.levels).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findLevel(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.levels).where(and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, id))).limit(1); return row ?? null; }
export async function insertLevel(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.levels.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.levels).values({ ...input, schoolId }).returning(); return row; }
export async function updateLevel(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.levels.$inferInsert>) { const [row] = await db.update(schema.levels).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, id))).returning(); return row ?? null; }

export async function listTracks(db: AcademicStructureDb, schoolId: string, paging: Paging, status?: typeof schema.trackStatus.enumValues[number]) {
  const condition = where([eq(schema.tracks.schoolId, schoolId), status ? eq(schema.tracks.status, status) : undefined]);
  const [rows, totals] = await Promise.all([db.select().from(schema.tracks).where(condition).orderBy(asc(schema.tracks.sequence), asc(schema.tracks.name), asc(schema.tracks.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.tracks).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findTrack(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.tracks).where(and(eq(schema.tracks.schoolId, schoolId), eq(schema.tracks.id, id))).limit(1); return row ?? null; }
export async function insertTrack(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.tracks.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.tracks).values({ ...input, schoolId }).returning(); return row; }
export async function updateTrack(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.tracks.$inferInsert>) { const [row] = await db.update(schema.tracks).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.tracks.schoolId, schoolId), eq(schema.tracks.id, id))).returning(); return row ?? null; }

export async function listSubjects(db: AcademicStructureDb, schoolId: string, paging: Paging, filters: { status?: typeof schema.subjectStatus.enumValues[number]; search?: string }) {
  const search = filters.search ? or(ilike(schema.subjects.name, `%${filters.search}%`), ilike(schema.subjects.code, `%${filters.search}%`)) : undefined;
  const condition = where([eq(schema.subjects.schoolId, schoolId), filters.status ? eq(schema.subjects.status, filters.status) : undefined, search]);
  const [rows, totals] = await Promise.all([db.select().from(schema.subjects).where(condition).orderBy(asc(schema.subjects.name), asc(schema.subjects.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.subjects).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findSubject(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.subjects).where(and(eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, id))).limit(1); return row ?? null; }
export async function insertSubject(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.subjects.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.subjects).values({ ...input, schoolId }).returning(); return row; }
export async function updateSubject(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.subjects.$inferInsert>) { const [row] = await db.update(schema.subjects).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, id))).returning(); return row ?? null; }

export async function listCurricula(db: AcademicStructureDb, schoolId: string, paging: Paging, status?: typeof schema.curriculumStatus.enumValues[number]) {
  const condition = where([eq(schema.curricula.schoolId, schoolId), status ? eq(schema.curricula.status, status) : undefined]);
  const [rows, totals] = await Promise.all([db.select().from(schema.curricula).where(condition).orderBy(asc(schema.curricula.name), asc(schema.curricula.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.curricula).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findCurriculum(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.curricula).where(and(eq(schema.curricula.schoolId, schoolId), eq(schema.curricula.id, id))).limit(1); return row ?? null; }
export async function insertCurriculum(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.curricula.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.curricula).values({ ...input, schoolId }).returning(); return row; }
export async function updateCurriculum(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.curricula.$inferInsert>) { const [row] = await db.update(schema.curricula).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.curricula.schoolId, schoolId), eq(schema.curricula.id, id))).returning(); return row ?? null; }

export async function listCurriculumVersions(db: AcademicStructureDb, schoolId: string, curriculumId: string, paging: Paging, status?: typeof schema.curriculumVersionStatus.enumValues[number]) {
  const condition = where([eq(schema.curriculumVersions.schoolId, schoolId), eq(schema.curriculumVersions.curriculumId, curriculumId), status ? eq(schema.curriculumVersions.status, status) : undefined]);
  const [rows, totals] = await Promise.all([db.select().from(schema.curriculumVersions).where(condition).orderBy(desc(schema.curriculumVersions.createdAt), desc(schema.curriculumVersions.id)).limit(paging.limit).offset(paging.offset), db.select({ value: count() }).from(schema.curriculumVersions).where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findCurriculumVersion(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.curriculumVersions).where(and(eq(schema.curriculumVersions.schoolId, schoolId), eq(schema.curriculumVersions.id, id))).limit(1); return row ?? null; }
export async function insertCurriculumVersion(db: AcademicStructureDb, schoolId: string, curriculumId: string, input: Omit<typeof schema.curriculumVersions.$inferInsert, 'schoolId' | 'curriculumId'>) { const [row] = await db.insert(schema.curriculumVersions).values({ ...input, schoolId, curriculumId }).returning(); return row; }
export async function updateCurriculumVersion(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.curriculumVersions.$inferInsert>) { const [row] = await db.update(schema.curriculumVersions).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.curriculumVersions.schoolId, schoolId), eq(schema.curriculumVersions.id, id))).returning(); return row ?? null; }
export async function curriculumVersionHasReferences(db: AcademicStructureDb, schoolId: string, id: string) {
  const [classRow, subjectRow] = await Promise.all([
    db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.curriculumVersionId, id))).limit(1),
    db.select({ id: schema.curriculumSubjects.id }).from(schema.curriculumSubjects).where(and(eq(schema.curriculumSubjects.schoolId, schoolId), eq(schema.curriculumSubjects.curriculumVersionId, id))).limit(1),
  ]);
  return classRow.length > 0 || subjectRow.length > 0;
}

export async function listCurriculumSubjects(db: AcademicStructureDb, schoolId: string, curriculumVersionId: string, paging: Paging, status?: typeof schema.curriculumSubjectStatus.enumValues[number]) {
  const condition = where([eq(schema.curriculumSubjects.schoolId, schoolId), eq(schema.curriculumSubjects.curriculumVersionId, curriculumVersionId), status ? eq(schema.curriculumSubjects.status, status) : undefined]);
  const [rows, totals] = await Promise.all([
    db.select({
      id: schema.curriculumSubjects.id,
      curriculumVersionId: schema.curriculumSubjects.curriculumVersionId,
      subjectId: schema.curriculumSubjects.subjectId,
      subjectName: schema.subjects.name,
      subjectCode: schema.subjects.code,
      coefficient: schema.curriculumSubjects.coefficient,
      displayOrder: schema.curriculumSubjects.displayOrder,
      status: schema.curriculumSubjects.status,
      createdAt: schema.curriculumSubjects.createdAt,
      updatedAt: schema.curriculumSubjects.updatedAt,
    }).from(schema.curriculumSubjects).innerJoin(schema.subjects, and(eq(schema.subjects.schoolId, schoolId), eq(schema.subjects.id, schema.curriculumSubjects.subjectId))).where(condition).orderBy(asc(schema.curriculumSubjects.displayOrder), asc(schema.subjects.name), asc(schema.curriculumSubjects.id)).limit(paging.limit).offset(paging.offset),
    db.select({ value: count() }).from(schema.curriculumSubjects).where(condition),
  ]); return { rows, total: totals[0]?.value ?? 0 };
}
export async function findCurriculumSubject(db: AcademicStructureDb, schoolId: string, id: string) { const [row] = await db.select().from(schema.curriculumSubjects).where(and(eq(schema.curriculumSubjects.schoolId, schoolId), eq(schema.curriculumSubjects.id, id))).limit(1); return row ?? null; }
export async function insertCurriculumSubject(db: AcademicStructureDb, schoolId: string, curriculumVersionId: string, input: Omit<typeof schema.curriculumSubjects.$inferInsert, 'schoolId' | 'curriculumVersionId'>) { const [row] = await db.insert(schema.curriculumSubjects).values({ ...input, schoolId, curriculumVersionId }).returning(); return row; }
export async function updateCurriculumSubject(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.curriculumSubjects.$inferInsert>) { const [row] = await db.update(schema.curriculumSubjects).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.curriculumSubjects.schoolId, schoolId), eq(schema.curriculumSubjects.id, id))).returning(); return row ?? null; }

export async function listClasses(db: AcademicStructureDb, schoolId: string, paging: Paging, filters: { academicYearId?: string; status?: typeof schema.classStatus.enumValues[number]; levelId?: string; stageId?: string; trackId?: string }) {
  const condition = where([
    eq(schema.classes.schoolId, schoolId),
    filters.academicYearId ? eq(schema.classes.academicYearId, filters.academicYearId) : undefined,
    filters.status ? eq(schema.classes.status, filters.status) : undefined,
    filters.levelId ? eq(schema.classes.levelId, filters.levelId) : undefined,
    filters.stageId ? eq(schema.levels.stageId, filters.stageId) : undefined,
    filters.trackId ? eq(schema.classes.trackId, filters.trackId) : undefined,
  ]);
  const base = db.select({
    id: schema.classes.id, academicYearId: schema.classes.academicYearId,
    levelId: schema.classes.levelId, stageId: schema.levels.stageId,
    trackId: schema.classes.trackId, curriculumVersionId: schema.classes.curriculumVersionId,
    name: schema.classes.name, status: schema.classes.status,
    createdAt: schema.classes.createdAt, updatedAt: schema.classes.updatedAt,
  }).from(schema.classes).innerJoin(schema.levels, and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, schema.classes.levelId)));
  const totalBase = db.select({ value: count() }).from(schema.classes).innerJoin(schema.levels, and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, schema.classes.levelId)));
  const [rows, totals] = await Promise.all([base.where(condition).orderBy(asc(schema.classes.name), asc(schema.classes.id)).limit(paging.limit).offset(paging.offset), totalBase.where(condition)]);
  return { rows, total: totals[0]?.value ?? 0 };
}
export async function findClass(db: AcademicStructureDb, schoolId: string, id: string) {
  const [row] = await db.select({
    id: schema.classes.id, academicYearId: schema.classes.academicYearId,
    levelId: schema.classes.levelId, stageId: schema.levels.stageId,
    trackId: schema.classes.trackId, curriculumVersionId: schema.classes.curriculumVersionId,
    name: schema.classes.name, status: schema.classes.status,
    createdAt: schema.classes.createdAt, updatedAt: schema.classes.updatedAt,
  }).from(schema.classes).innerJoin(schema.levels, and(eq(schema.levels.schoolId, schoolId), eq(schema.levels.id, schema.classes.levelId))).where(and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, id))).limit(1); return row ?? null;
}
export async function insertClass(db: AcademicStructureDb, schoolId: string, input: Omit<typeof schema.classes.$inferInsert, 'schoolId'>) { const [row] = await db.insert(schema.classes).values({ ...input, schoolId }).returning(); return row; }
export async function updateClass(db: AcademicStructureDb, schoolId: string, id: string, input: Partial<typeof schema.classes.$inferInsert>) { const [row] = await db.update(schema.classes).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, id))).returning(); return row ?? null; }
