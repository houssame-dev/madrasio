import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import * as s from '@school/database';
import type { TimetableDb, Tx } from '../application/service';
import type { DraftContext, Lesson, Reservation } from '../domain/builder';
import { clockTime } from '../domain/builder';
type Db = TimetableDb | Tx;

export async function context(db: Db, schoolId: string, input: DraftContext, locked: boolean) {
  const y = db.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, schoolId), eq(s.academicYears.id, input.academicYearId)));
  const p = db.select().from(s.academicPeriods).where(and(eq(s.academicPeriods.schoolId, schoolId), eq(s.academicPeriods.academicYearId, input.academicYearId), eq(s.academicPeriods.id, input.academicPeriodId)));
  const c = db.select().from(s.classes).where(and(eq(s.classes.schoolId, schoolId), eq(s.classes.academicYearId, input.academicYearId), eq(s.classes.id, input.classId)));
  const [year] = await (locked ? y.for('share') : y), [period] = await (locked ? p.for('share') : p), [classRow] = await (locked ? c.for('share') : c);
  const [level] = classRow ? await db.select().from(s.levels).where(and(eq(s.levels.schoolId, schoolId), eq(s.levels.id, classRow.levelId))) : [];
  const configs = await db.selectDistinctOn([s.timetableConfigurations.scopeKey]).from(s.timetableConfigurations).where(and(eq(s.timetableConfigurations.schoolId, schoolId), eq(s.timetableConfigurations.academicYearId, input.academicYearId))).orderBy(s.timetableConfigurations.scopeKey, desc(s.timetableConfigurations.revision));
  const assignmentsQuery = db.select().from(s.teacherAssignments).where(and(eq(s.teacherAssignments.schoolId, schoolId), eq(s.teacherAssignments.academicYearId, input.academicYearId), eq(s.teacherAssignments.classId, input.classId)));
  const assignments = await (locked ? assignmentsQuery.for('share') : assignmentsQuery);
  const teacherQuery = db.select().from(s.teachers).where(and(eq(s.teachers.schoolId, schoolId), inArray(s.teachers.id, assignments.map(a => a.teacherId))));
  const teachers = assignments.length ? await (locked ? teacherQuery.for('share') : teacherQuery) : [];
  const roomsQuery = db.select().from(s.timetableRooms).where(eq(s.timetableRooms.schoolId, schoolId)).orderBy(asc(s.timetableRooms.name));
  const rooms = await (locked ? roomsQuery.for('share') : roomsQuery);
  const subjectQuery = db.select().from(s.subjects).where(eq(s.subjects.schoolId, schoolId));
  const subjects = await (locked ? subjectQuery.for('share') : subjectQuery);
  const curriculumQuery = db.select().from(s.curriculumSubjects).where(and(eq(s.curriculumSubjects.schoolId, schoolId), eq(s.curriculumSubjects.curriculumVersionId, classRow?.curriculumVersionId ?? input.classId)));
  const curriculumSubjects = await (locked ? curriculumQuery.for('share') : curriculumQuery);
  const loads = await db.selectDistinctOn([s.timetableLoads.subjectId]).from(s.timetableLoads).where(and(eq(s.timetableLoads.schoolId, schoolId), eq(s.timetableLoads.classId, input.classId))).orderBy(s.timetableLoads.subjectId, desc(s.timetableLoads.revision));
  return { year, period, classRow, level, configs, assignments, teachers, rooms, subjects, curriculumSubjects, loads };
}
export async function latest(db: Db, schoolId: string, c: DraftContext): Promise<typeof s.timetableDrafts.$inferSelect | null> {
  return (await db.select().from(s.timetableDrafts).where(and(eq(s.timetableDrafts.schoolId, schoolId), eq(s.timetableDrafts.academicYearId, c.academicYearId), eq(s.timetableDrafts.academicPeriodId, c.academicPeriodId), eq(s.timetableDrafts.classId, c.classId))).orderBy(desc(s.timetableDrafts.revision)).limit(1))[0] ?? null;
}
export async function configuration(db: Db, schoolId: string, yearId: string, id: string) {
  return (await db.select().from(s.timetableConfigurations).where(and(eq(s.timetableConfigurations.schoolId, schoolId), eq(s.timetableConfigurations.academicYearId, yearId), eq(s.timetableConfigurations.id, id))))[0];
}
export async function lessons(db: Db, schoolId: string, id: string): Promise<Lesson[]> {
  return (await db.select().from(s.timetableLessons).where(and(eq(s.timetableLessons.schoolId, schoolId), eq(s.timetableLessons.draftId, id))).orderBy(s.timetableLessons.weekday, s.timetableLessons.startMinute, s.timetableLessons.lessonKey)).map(l => ({ lessonKey: l.lessonKey, weekday: l.weekday, start: clockTime(l.startMinute), end: clockTime(l.endMinute), subjectId: l.subjectId, teacherAssignmentId: l.teacherAssignmentId, roomId: l.roomId }));
}
export async function reservations(db: Db, schoolId: string, current: DraftContext, startDate: string, endDate: string): Promise<Reservation[]> {
  const heads = await db.selectDistinctOn([s.timetableDrafts.academicYearId, s.timetableDrafts.academicPeriodId, s.timetableDrafts.classId]).from(s.timetableDrafts).where(eq(s.timetableDrafts.schoolId, schoolId)).orderBy(s.timetableDrafts.academicYearId, s.timetableDrafts.academicPeriodId, s.timetableDrafts.classId, desc(s.timetableDrafts.revision));
  const relevant = heads.filter(h => h.startDate <= endDate && h.endDate >= startDate && !(h.academicYearId === current.academicYearId && h.academicPeriodId === current.academicPeriodId && h.classId === current.classId));
  if (!relevant.length) return [];
  const rows = await db.select({ lesson: s.timetableLessons, className: s.classes.name, periodName: s.academicPeriods.name }).from(s.timetableLessons)
    .innerJoin(s.classes, and(eq(s.classes.schoolId, s.timetableLessons.schoolId), eq(s.classes.id, s.timetableLessons.classId)))
    .innerJoin(s.timetableDrafts, and(eq(s.timetableDrafts.schoolId, s.timetableLessons.schoolId), eq(s.timetableDrafts.id, s.timetableLessons.draftId)))
    .innerJoin(s.academicPeriods, and(eq(s.academicPeriods.schoolId, s.timetableDrafts.schoolId), eq(s.academicPeriods.id, s.timetableDrafts.academicPeriodId)))
    .where(and(eq(s.timetableLessons.schoolId, schoolId), inArray(s.timetableLessons.draftId, relevant.map(r => r.id))));
  return rows.map(({ lesson: l, className, periodName }) => {
    const head = relevant.find(h => h.id === l.draftId)!;
    return { lessonKey: l.lessonKey, classId: l.classId, className, periodName, teacherId: l.teacherId, roomId: l.roomId, weekday: l.weekday, start: clockTime(l.startMinute), end: clockTime(l.endMinute), startDate: head.startDate, endDate: head.endDate };
  });
}
export async function previousRequest(db: Db, schoolId: string, key: string) {
  return (await db.select().from(s.timetableDrafts).where(and(eq(s.timetableDrafts.schoolId, schoolId), eq(s.timetableDrafts.requestKey, key))))[0];
}
export async function insert(tx: Tx, draft: typeof s.timetableDrafts.$inferInsert, lessons: Omit<typeof s.timetableLessons.$inferInsert, 'draftId'>[]) {
  const [saved] = await tx.insert(s.timetableDrafts).values(draft).returning();
  if (lessons.length) await tx.insert(s.timetableLessons).values(lessons.map(l => ({ ...l, draftId: saved.id })));
  return saved;
}
