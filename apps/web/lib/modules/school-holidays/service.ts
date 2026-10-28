import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, count, eq, gte, ilike, isNull, lt, gt, lte, or } from 'drizzle-orm';
import * as s from '@school/database';
import type { TimetableDb, Actor } from '@/lib/modules/timetable/application/service';
import { requireOperation, resolveCurrentContext, type AuthorizationDb } from '@/lib/authorization/server';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { appendAuditEvent, type AuditDb } from '@/lib/audit/repository';
import { createHolidaySchema, holidayQuerySchema, removeHolidaySchema, updateHolidaySchema, type HolidayView } from './contracts';
type Db = TimetableDb | Parameters<Parameters<TimetableDb['transaction']>[0]>[0];
const h = s.schoolHolidays;
const view = { id: h.id, name: h.name, type: h.type, startDate: h.startDate, endDate: h.endDate, description: h.description, revision: h.revision };

/** Internal reusable date resolver. Callers must first authorize School/child/assignment scope. */
export async function schoolHolidaysOnDate(db: Pick<AuditDb, 'select'>, schoolId: string, date: string): Promise<HolidayView[]> {
  return db.select(view).from(h).where(and(eq(h.schoolId, schoolId), isNull(h.removedAt), lte(h.startDate, date), gte(h.endDate, date))).orderBy(asc(h.startDate), asc(h.name), asc(h.id));
}
async function authorize(db: Db, actor: Actor, manage: boolean) {
  const auth = db as unknown as AuthorizationDb;
  await requireOperation(auth, actor, { permission: manage ? 'academic_structure.manage' : 'academic_structure.read', scope: { kind: 'school' } });
  const context = await resolveCurrentContext(auth, actor);
  if (context.role !== 'SCHOOL_ADMIN') throw new ForbiddenError();
  const [school] = await db.select({ status: s.schools.status }).from(s.schools).where(eq(s.schools.id, actor.schoolId));
  if (school?.status !== 'ACTIVE') throw new ForbiddenError();
}
export async function listSchoolHolidays(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = holidayQuerySchema.parse(raw);
  return db.transaction(async tx => {
    await authorize(tx, actor, false);
    let from = input.dateFrom, to = input.dateTo;
    if (input.academicYearId) {
      const [year] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, actor.schoolId), eq(s.academicYears.id, input.academicYearId)));
      if (!year) throw new NotFoundError();
      from = from && from > year.startDate ? from : year.startDate;
      to = to && to < year.endDate ? to : year.endDate;
    }
    const scope = and(eq(h.schoolId, actor.schoolId), isNull(h.removedAt), input.search ? ilike(h.name, `%${input.search.replace(/[\\%_]/g, '\\$&')}%`) : undefined,
      input.type ? eq(h.type, input.type) : undefined, from ? gte(h.endDate, from) : undefined, to ? lte(h.startDate, to) : undefined);
    const data = from && to && from > to ? [] : await tx.select(view).from(h).where(scope).orderBy(asc(h.startDate), asc(h.name), asc(h.id)).limit(20).offset((input.page - 1) * 20);
    const [total] = await tx.select({ n: count() }).from(h).where(scope);
    return { data, meta: { page: input.page, pageSize: 20, total: from && to && from > to ? 0 : total.n } };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function readSchoolHoliday(db: TimetableDb, actor: Actor, id: string) {
  await authorize(db, actor, false);
  const [row] = await db.select(view).from(h).where(and(eq(h.schoolId, actor.schoolId), eq(h.id, id), isNull(h.removedAt)));
  if (!row) throw new NotFoundError(); return row;
}
export async function mutateSchoolHoliday(db: TimetableDb, actor: Actor, action: 'create' | 'update' | 'remove', raw: unknown, id?: string, now = new Date()) {
  const fields = action === 'remove' ? null : action === 'create' ? createHolidaySchema.parse(raw) : updateHolidaySchema.parse(raw);
  const expected = action === 'create' ? null : action === 'remove' ? removeHolidaySchema.parse(raw).expectedRevision : updateHolidaySchema.parse(raw).expectedRevision;
  await authorize(db, actor, true);
  return db.transaction(async tx => {
    // Identical School -> User -> Membership order to Attendance/publication writes.
    await tx.select({ id: s.schools.id }).from(s.schools).where(eq(s.schools.id, actor.schoolId)).for('update');
    await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, actor.userId!)).for('share');
    await tx.select({ id: s.schoolMemberships.id }).from(s.schoolMemberships).where(and(eq(s.schoolMemberships.schoolId, actor.schoolId), eq(s.schoolMemberships.userId, actor.userId!))).for('share');
    await authorize(tx, actor, true);
    const [old] = id ? await tx.select().from(h).where(and(eq(h.schoolId, actor.schoolId), eq(h.id, id), isNull(h.removedAt))).for('update') : [];
    if (action !== 'create' && !old) throw new NotFoundError();
    if (old && old.revision !== expected) throw new ConflictError('Holiday changed; reload before saving.');
    if (fields && (!old || old.startDate !== fields.startDate || old.endDate !== fields.endDate)) {
      // Only newly closed dates matter. Retained dates may contain legacy history.
      const records = await tx.select({ id: s.attendanceRecords.id }).from(s.attendanceRecords).where(and(
        eq(s.attendanceRecords.schoolId, actor.schoolId), gte(s.attendanceRecords.attendanceDate, fields.startDate), lte(s.attendanceRecords.attendanceDate, fields.endDate),
        old ? or(lt(s.attendanceRecords.attendanceDate, old.startDate), gt(s.attendanceRecords.attendanceDate, old.endDate)) : undefined,
      )).limit(1);
      if (records.length) throw new HolidayAttendanceConflict();
    }
    const values = fields ? { name: fields.name, type: fields.type, startDate: fields.startDate, endDate: fields.endDate, description: fields.description || null } : {};
    const [saved] = old ? await tx.update(h).set({ ...values, updatedBy: actor.userId!, updatedAt: now, revision: old.revision + 1, ...(action === 'remove' ? { removedAt: now } : {}) }).where(eq(h.id, old.id)).returning()
      : await tx.insert(h).values({ ...fields!, description: fields!.description || null, schoolId: actor.schoolId, createdBy: actor.userId!, updatedBy: actor.userId! }).returning();
    await appendAuditEvent(tx, { scope: 'SCHOOL', schoolId: actor.schoolId, actorKind: 'USER', actorUserId: actor.userId!, resourceType: 'SchoolHoliday', resourceId: saved.id,
      action: action === 'create' ? 'SchoolHolidayCreated' : action === 'update' ? 'SchoolHolidayUpdated' : 'SchoolHolidayRemoved',
      // Audit metadata is bounded to 1024 bytes. Keep the transition and a digest
      // of editable prose, rather than duplicating two potentially 2KB descriptions.
      metadata: { before: old ? auditView(old) : '', after: auditView(saved) } });
    return { id: saved.id, name: saved.name, type: saved.type, startDate: saved.startDate, endDate: saved.endDate, description: saved.description, revision: saved.revision };
  });
}
function auditView(row: typeof h.$inferSelect) {
  return JSON.stringify({ type: row.type, startDate: row.startDate, endDate: row.endDate, revision: row.revision, contentSha256: createHash('sha256').update(JSON.stringify([row.name, row.description])).digest('hex') });
}
export class HolidayAttendanceConflict extends AppError {
  readonly featureCode = 'HOLIDAY_ATTENDANCE_CONFLICT';
  constructor() { super('CONFLICT', 'Attendance already exists on a newly closed date. Choose other dates.', { status: 409 }); }
}
