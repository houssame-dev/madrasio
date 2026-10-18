import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@school/database';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { ConflictError, NotFoundError, ValidationError, BusinessRuleViolationError, ForbiddenError } from '@/lib/errors';
import { currencySettingsSchema } from '../domain/currency';
import { adjustmentSchema, feeTypeSchema, generateSchema, previewSchema, schoolToday, structurePatchSchema, structureSchema, validatePeriods,
  type AdjustmentInput, type ChargeSelection, type GenerateInput } from '../domain/contracts';

export type FinanceDb = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<FinanceDb['transaction']>[0]>[0];
export interface FinanceActor { userId: string | null; schoolId: string }
const { schools, users, schoolMemberships, academicYears, levels, classes, students, studentEnrollments,
  feeTypes, feeStructures, studentCharges, financeBatches, financeChargeEvents } = schema;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scope = (schoolId: string) => eq(studentCharges.schoolId, schoolId);
export async function authorize(db: FinanceDb | Tx, actor: FinanceActor, write = false) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission: write ? 'finance.manage' : 'finance.read', scope: { kind: 'school' } });
  const [school] = await db.select({ status: schools.status }).from(schools).where(eq(schools.id, actor.schoolId));
  if (school?.status !== 'ACTIVE') throw new ForbiddenError();
}
export async function lock(tx: Tx, actor: FinanceActor) {
  // One short school-local finance write order; no process-global mutex or network I/O.
  const [school] = await tx.select().from(schools).where(eq(schools.id, actor.schoolId)).for('update');
  if (!school) throw new NotFoundError();
  await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.userId!)).for('share');
  await tx.select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(eq(schoolMemberships.schoolId, actor.schoolId), eq(schoolMemberships.userId, actor.userId!))).for('share');
  await authorize(tx, actor, true);
  return school;
}
async function editableYear(tx: Tx, actor: FinanceActor, id: string) {
  const [year] = await tx.select().from(academicYears).where(and(eq(academicYears.schoolId, actor.schoolId), eq(academicYears.id, id))).for('share');
  if (!year) throw new NotFoundError();
  if (!['PLANNED', 'ACTIVE'].includes(year.status)) throw new BusinessRuleViolationError('Academic year is closed.');
  return year;
}
async function configuration<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    const code = (v: unknown): boolean => typeof v === 'object' && v !== null && (('code' in v && v.code === '23505') || ('cause' in v && code(v.cause)));
    if (code(error)) throw new ConflictError('A fee configuration already exists for this scope.');
    throw error;
  }
}

async function currencyLocked(db: FinanceDb | Tx, schoolId: string) {
  const [row] = await db.select({ locked: sql<boolean>`exists(select 1 from ${feeStructures} where ${feeStructures.schoolId}=${schoolId}) or exists(select 1 from ${studentCharges} where ${studentCharges.schoolId}=${schoolId}) or exists(select 1 from ${schema.financePayments} where ${schema.financePayments.schoolId}=${schoolId})` }).from(schools).where(eq(schools.id, schoolId));
  return row.locked;
}
export async function financeSettings(db: FinanceDb, actor: FinanceActor) {
  await authorize(db, actor);
  const [school] = await db.select({ currency: schools.financeCurrency }).from(schools).where(eq(schools.id, actor.schoolId));
  return { currency: school.currency, locked: await currencyLocked(db, actor.schoolId) };
}
export async function setFinanceCurrency(db: FinanceDb, actor: FinanceActor, raw: unknown) {
  const input = currencySettingsSchema.parse(raw); await authorize(db, actor, true);
  return db.transaction(async tx => {
    const school = await lock(tx, actor);
    const locked = await currencyLocked(tx, actor.schoolId);
    if (school.financeCurrency === input.currency) return { currency: input.currency, locked };
    if (locked) throw new ConflictError('Currency cannot change after financial records exist.');
    await tx.update(schools).set({ financeCurrency: input.currency, updatedAt: new Date() }).where(eq(schools.id, actor.schoolId));
    return { currency: input.currency, locked: false };
  });
}

export async function saveFeeType(db: FinanceDb, actor: FinanceActor, raw: unknown, id?: string) {
  const input = feeTypeSchema.parse(raw); await authorize(db, actor, true);
  return configuration(() => db.transaction(async tx => {
    await lock(tx, actor);
    if (!id) return (await tx.insert(feeTypes).values({ ...input, schoolId: actor.schoolId }).returning())[0];
    const [value] = await tx.update(feeTypes).set(input).where(and(eq(feeTypes.schoolId, actor.schoolId), eq(feeTypes.id, id))).returning();
    if (!value) throw new NotFoundError(); return value;
  }));
}
export async function saveStructure(db: FinanceDb, actor: FinanceActor, raw: unknown, id?: string) {
  await authorize(db, actor, true);
  return configuration(() => db.transaction(async tx => {
    const school = await lock(tx, actor);
    if (id) {
      const input = structurePatchSchema.parse(raw);
      const [current] = await tx.select().from(feeStructures).where(and(eq(feeStructures.schoolId, actor.schoolId), eq(feeStructures.id, id))).for('update');
      if (!current) throw new NotFoundError();
      const year = await editableYear(tx, actor, current.academicYearId);
      if (input.revision !== current.revision) throw new ConflictError('Fee structure changed; reload.');
      validatePeriods(current.cadence, input.periods, year);
      return (await tx.update(feeStructures).set({ ...input, revision: current.revision + 1, updatedBy: actor.userId! }).where(eq(feeStructures.id, id)).returning())[0];
    }
    const input = structureSchema.parse(raw); const year = await editableYear(tx, actor, input.academicYearId);
    validatePeriods(input.cadence, input.periods, year);
    const [type] = await tx.select().from(feeTypes).where(and(eq(feeTypes.schoolId, actor.schoolId), eq(feeTypes.id, input.feeTypeId), eq(feeTypes.active, true)));
    if (!type) throw new NotFoundError();
    if (input.levelId && !(await tx.select({ id: levels.id }).from(levels).where(and(eq(levels.schoolId, actor.schoolId), eq(levels.id, input.levelId), eq(levels.status, 'ACTIVE')))).length) throw new NotFoundError();
    return (await tx.insert(feeStructures).values({ ...input, currency: school.financeCurrency, schoolId: actor.schoolId, createdBy: actor.userId!, updatedBy: actor.userId! }).returning())[0];
  }));
}

export async function listFinance(db: FinanceDb, actor: FinanceActor, input: { academicYearId?: string; studentId?: string; status?: 'OPEN' | 'CANCELLED'; page: number; search: string }) {
  await authorize(db, actor);
  const conditions = and(scope(actor.schoolId), input.academicYearId ? eq(studentCharges.academicYearId, input.academicYearId) : undefined,
    input.studentId ? eq(studentCharges.studentId, input.studentId) : undefined, input.status ? eq(studentCharges.status, input.status) : undefined);
  const [types, structures, years, levelRows, classRows, studentRows, charges, total] = await Promise.all([
    db.select().from(feeTypes).where(eq(feeTypes.schoolId, actor.schoolId)).orderBy(asc(feeTypes.name)).limit(500),
    db.select().from(feeStructures).where(and(eq(feeStructures.schoolId, actor.schoolId), input.academicYearId ? eq(feeStructures.academicYearId, input.academicYearId) : undefined)).limit(500),
    db.select().from(academicYears).where(eq(academicYears.schoolId, actor.schoolId)).orderBy(desc(academicYears.startDate)).limit(100),
    db.select().from(levels).where(eq(levels.schoolId, actor.schoolId)).limit(500),
    db.select().from(classes).where(and(eq(classes.schoolId, actor.schoolId), input.academicYearId ? eq(classes.academicYearId, input.academicYearId) : undefined)).limit(500),
    db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(and(eq(students.schoolId, actor.schoolId), eq(students.status, 'ACTIVE'),
      input.search ? or(ilike(students.firstName, `%${input.search}%`), ilike(students.lastName, `%${input.search}%`), ilike(students.studentCode, `%${input.search}%`)) : undefined)).orderBy(asc(students.lastName), asc(students.id)).limit(100),
    db.select({ charge: studentCharges, studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}` }).from(studentCharges)
      .innerJoin(students, and(eq(students.schoolId, studentCharges.schoolId), eq(students.id, studentCharges.studentId)))
      .where(conditions).orderBy(desc(studentCharges.createdAt), asc(studentCharges.id)).limit(50).offset((input.page - 1) * 50),
    db.select({ count: sql<number>`count(*)::int` }).from(studentCharges).where(conditions),
  ]);
  return { settings: await financeSettings(db, actor), types, structures, years, levels: levelRows, classes: classRows, students: studentRows, charges, total: total[0].count, page: input.page };
}
export async function chargeDetail(db: FinanceDb, actor: FinanceActor, id: string) {
  await authorize(db, actor);
  const [charge] = await db.select().from(studentCharges).where(and(scope(actor.schoolId), eq(studentCharges.id, id)));
  if (!charge) throw new NotFoundError();
  const events = await db.select().from(financeChargeEvents).where(and(eq(financeChargeEvents.schoolId, actor.schoolId), eq(financeChargeEvents.chargeId, id))).orderBy(asc(financeChargeEvents.occurredAt), asc(financeChargeEvents.id));
  return { charge, events };
}

function normalize(input: ChargeSelection) {
  return { structureId: input.structureId, studentIds: input.studentIds ? [...input.studentIds].sort() : undefined,
    classId: input.classId, levelId: input.levelId, periods: [...input.periods].sort() };
}
async function plan(tx: Tx, actor: FinanceActor, input: ChargeSelection) {
  const [structure] = await tx.select().from(feeStructures).where(and(eq(feeStructures.schoolId, actor.schoolId), eq(feeStructures.id, input.structureId))).for('share');
  if (!structure || !structure.active) throw new NotFoundError();
  const year = await editableYear(tx, actor, structure.academicYearId);
  validatePeriods(structure.cadence, structure.periods, year);
  const [type] = await tx.select().from(feeTypes).where(and(eq(feeTypes.schoolId, actor.schoolId), eq(feeTypes.id, structure.feeTypeId), eq(feeTypes.active, true))).for('share');
  if (!type) throw new NotFoundError();
  const periods = structure.periods.filter(p => input.periods.includes(p.period)).sort((a, b) => a.period.localeCompare(b.period));
  if (periods.length !== input.periods.length) throw new ValidationError('Select configured periods only.');
  const eligible = await tx.select({ studentId: students.id, studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`, classId: classes.id, levelId: classes.levelId })
    .from(studentEnrollments).innerJoin(students, and(eq(students.schoolId, studentEnrollments.schoolId), eq(students.id, studentEnrollments.studentId)))
    .innerJoin(classes, and(eq(classes.schoolId, studentEnrollments.schoolId), eq(classes.academicYearId, studentEnrollments.academicYearId), eq(classes.id, studentEnrollments.classId)))
    .where(and(eq(studentEnrollments.schoolId, actor.schoolId), eq(studentEnrollments.academicYearId, structure.academicYearId), eq(studentEnrollments.status, 'ACTIVE'),
      eq(students.status, 'ACTIVE'), eq(classes.status, 'ACTIVE'), input.studentIds ? inArray(students.id, input.studentIds) : undefined,
      input.classId ? eq(classes.id, input.classId) : undefined, input.levelId ? eq(classes.levelId, input.levelId) : undefined,
      structure.levelId ? eq(classes.levelId, structure.levelId) : undefined)).orderBy(asc(students.id)).limit(501).for('share');
  if (!eligible.length || eligible.length > 500 || (input.studentIds && eligible.length !== input.studentIds.length)) throw new BusinessRuleViolationError('Select 1–500 eligible students with active enrollment in this academic year.');
  const existing = await tx.select().from(studentCharges).where(and(scope(actor.schoolId), eq(studentCharges.academicYearId, structure.academicYearId), eq(studentCharges.feeTypeId, structure.feeTypeId), inArray(studentCharges.studentId, eligible.map(s => s.studentId)), inArray(studentCharges.period, input.periods)));
  const existingIds = new Map(existing.map(c => [`${c.studentId}:${c.period}`, c.id]));
  const items = eligible.flatMap(student => periods.map(p => ({ ...student, ...p, amountCents: structure.amountCents,
    existingChargeId: existingIds.get(`${student.studentId}:${p.period}`) ?? null })));
  const totalCents = items.reduce((sum, item) => sum + (item.existingChargeId ? 0 : item.amountCents), 0);
  return { structure, items, totalCents, previewHash: digest({ input: normalize(input), structure, typeName: type.name, items }), feeName: type.name,
    created: items.filter(i => !i.existingChargeId).length, skipped: items.filter(i => i.existingChargeId).length };
}
export async function previewCharges(db: FinanceDb, actor: FinanceActor, raw: unknown) {
  const input = previewSchema.parse(raw); await authorize(db, actor, true);
  return db.transaction(async tx => { await lock(tx, actor); const value = await plan(tx, actor, input);
    return { items: value.items, totalCents: value.totalCents, previewHash: value.previewHash, created: value.created, skipped: value.skipped }; });
}
export async function generateCharges(db: FinanceDb, actor: FinanceActor, raw: GenerateInput) {
  const input = generateSchema.parse(raw); await authorize(db, actor, true);
  return db.transaction(async tx => {
    await lock(tx, actor);
    const hash = digest({ ...normalize(input), previewHash: input.previewHash });
    const [old] = await tx.select().from(financeBatches).where(and(eq(financeBatches.schoolId, actor.schoolId), eq(financeBatches.requestKey, input.requestKey)));
    if (old) { if (old.requestHash !== hash) throw new ConflictError('Idempotency key reused with different input.'); return old.result; }
    const value = await plan(tx, actor, input);
    if (value.previewHash !== input.previewHash) throw new ConflictError('Preview changed. Preview again before confirming.');
    const result: schema.FinanceBatchResult = { chargeIds: [], created: value.created, skipped: value.skipped, totalCents: value.totalCents };
    const [batch] = await tx.insert(financeBatches).values({ schoolId: actor.schoolId, requestKey: input.requestKey, requestHash: hash, createdBy: actor.userId!, result }).returning();
    const rows = value.items.filter(item => !item.existingChargeId).map(item => ({ schoolId: actor.schoolId, studentId: item.studentId,
        academicYearId: value.structure.academicYearId, feeTypeId: value.structure.feeTypeId, structureId: value.structure.id,
        batchId: batch.id, classId: item.classId, feeName: value.feeName, structureRevision: value.structure.revision,
        period: item.period, dueDate: item.dueDate, originalCents: item.amountCents, currency: value.structure.currency }));
    // Bound parameter counts and database round trips without splitting the atomic batch.
    for (let offset = 0; offset < rows.length; offset += 250) {
      const inserted = await tx.insert(studentCharges).values(rows.slice(offset, offset + 250)).returning({ id: studentCharges.id });
      result.chargeIds.push(...inserted.map(c => c.id));
    }
    await tx.update(financeBatches).set({ result }).where(eq(financeBatches.id, batch.id));
    return result;
  });
}
export async function adjustCharge(db: FinanceDb, actor: FinanceActor, id: string, raw: AdjustmentInput, now = new Date()) {
  const input = adjustmentSchema.parse(raw); await authorize(db, actor, true);
  return db.transaction(async tx => {
    const school = await lock(tx, actor); const hash = digest({ id, ...input });
    const [old] = await tx.select().from(financeChargeEvents).where(and(eq(financeChargeEvents.schoolId, actor.schoolId), eq(financeChargeEvents.requestKey, input.requestKey)));
    if (old) { if (old.requestHash !== hash) throw new ConflictError('Idempotency key reused.'); return old; }
    const [charge] = await tx.select().from(studentCharges).where(and(scope(actor.schoolId), eq(studentCharges.id, id))).for('update');
    if (!charge) throw new NotFoundError();
    if (charge.status !== 'OPEN') throw new BusinessRuleViolationError('Cancelled charge cannot be changed.');
    const before = charge.originalCents - charge.reductionCents;
    let after = 0;
    if (input.kind === 'CANCELLATION') {
      if (charge.allocatedCents !== 0 || charge.dueDate <= schoolToday(school.timezone, now)) throw new BusinessRuleViolationError('Only fully unpaid future charges may be cancelled.');
      await tx.update(studentCharges).set({ status: 'CANCELLED' }).where(eq(studentCharges.id, id));
    } else {
      after = before - input.amountCents!;
      if (after < charge.allocatedCents) throw new BusinessRuleViolationError('Reduction exceeds unpaid charge amount.');
      await tx.update(studentCharges).set({ reductionCents: charge.reductionCents + input.amountCents! }).where(eq(studentCharges.id, id));
    }
    return (await tx.insert(financeChargeEvents).values({ schoolId: actor.schoolId, chargeId: id, requestKey: input.requestKey,
      requestHash: hash, kind: input.kind, reason: input.reason, beforeCents: before, afterCents: after, actorId: actor.userId! }).returning())[0];
  });
}
