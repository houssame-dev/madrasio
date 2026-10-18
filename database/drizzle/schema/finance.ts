import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { academicYears } from './academic-years';
import { levels } from './academic-structure';
import { classes } from './classes';
import { students } from './students';
import { schoolMemberships } from './memberships';

export interface FeePeriod { period: string; dueDate: string }
export interface FinanceBatchResult { chargeIds: string[]; created: number; skipped: number; totalCents: number }

export const feeTypes = pgTable('finance_fee_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('finance_fee_types_school_id_unique').on(t.schoolId, t.id),
  uniqueIndex('finance_fee_types_name_unique').on(t.schoolId, sql`lower(${t.name})`),
  check('finance_fee_types_name_check', sql`length(btrim(${t.name})) between 1 and 100`),
]).enableRLS();

export const feeStructures = pgTable('finance_fee_structures', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(),
  academicYearId: uuid('academic_year_id').notNull(), feeTypeId: uuid('fee_type_id').notNull(),
  levelId: uuid('level_id'), cadence: text('cadence').$type<'MONTHLY' | 'ONCE'>().notNull(),
  amountCents: integer('amount_cents').notNull(), currency: text('currency').notNull().default('MAD'),
  periods: jsonb('periods').$type<FeePeriod[]>().notNull(), active: boolean('active').notNull().default(true),
  revision: integer('revision').notNull().default(1),
  createdBy: uuid('created_by').notNull(), updatedBy: uuid('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.schoolId, t.currency], foreignColumns: [schools.id, schools.financeCurrency], name: 'finance_structures_currency_fk' }).onDelete('restrict'),
  unique('finance_structures_context_unique').on(t.schoolId, t.academicYearId, t.feeTypeId, t.id),
  unique('finance_structures_school_id_unique').on(t.schoolId, t.id),
  foreignKey({ columns: [t.schoolId, t.academicYearId], foreignColumns: [academicYears.schoolId, academicYears.id], name: 'finance_structures_year_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.feeTypeId], foreignColumns: [feeTypes.schoolId, feeTypes.id], name: 'finance_structures_type_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.levelId], foreignColumns: [levels.schoolId, levels.id], name: 'finance_structures_level_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.createdBy], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_structures_creator_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.updatedBy], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_structures_editor_fk' }).onDelete('restrict'),
  uniqueIndex('finance_structures_active_scope_unique').on(t.schoolId, t.academicYearId, t.feeTypeId, sql`coalesce(${t.levelId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`${t.active}`),
  check('finance_structures_values_check', sql`${t.currency} in ('MAD','EUR','USD','GBP') and ${t.cadence} in ('MONTHLY','ONCE') and ${t.amountCents} between 1 and 999999999 and ${t.revision}>0 and jsonb_typeof(${t.periods})='array' and jsonb_array_length(${t.periods}) between 1 and 36`),
]).enableRLS();

export const financeBatches = pgTable('finance_generation_batches', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(),
  createdBy: uuid('created_by').notNull(), result: jsonb('result').$type<FinanceBatchResult>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('finance_batches_school_id_unique').on(t.schoolId, t.id),
  unique('finance_batches_request_unique').on(t.schoolId, t.requestKey),
  foreignKey({ columns: [t.schoolId, t.createdBy], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_batches_actor_fk' }).onDelete('restrict'),
]).enableRLS();

export const studentCharges = pgTable('finance_student_charges', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(), academicYearId: uuid('academic_year_id').notNull(),
  feeTypeId: uuid('fee_type_id').notNull(), structureId: uuid('structure_id').notNull(),
  batchId: uuid('batch_id').notNull(), classId: uuid('class_id').notNull(),
  feeName: text('fee_name').notNull(), structureRevision: integer('structure_revision').notNull(),
  period: text('period').notNull(), dueDate: date('due_date').notNull(),
  originalCents: integer('original_cents').notNull(), reductionCents: integer('reduction_cents').notNull().default(0),
  // Reserved allocation aggregate: Pass 2 must lock this same charge before allocation.
  allocatedCents: integer('allocated_cents').notNull().default(0),
  currency: text('currency').notNull().default('MAD'),
  status: text('status').$type<'OPEN' | 'CANCELLED'>().notNull().default('OPEN'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.schoolId, t.currency], foreignColumns: [schools.id, schools.financeCurrency], name: 'finance_charges_currency_fk' }).onDelete('restrict'),
  unique('finance_charges_currency_context_unique').on(t.schoolId, t.studentId, t.id, t.currency),
  unique('finance_charges_school_id_unique').on(t.schoolId, t.id),
  unique('finance_charges_student_context_unique').on(t.schoolId, t.studentId, t.id),
  unique('finance_charges_logical_identity_unique').on(t.schoolId, t.studentId, t.academicYearId, t.feeTypeId, t.period),
  foreignKey({ columns: [t.schoolId, t.studentId], foreignColumns: [students.schoolId, students.id], name: 'finance_charges_student_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.classId], foreignColumns: [classes.schoolId, classes.academicYearId, classes.id], name: 'finance_charges_class_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.academicYearId, t.feeTypeId, t.structureId], foreignColumns: [feeStructures.schoolId, feeStructures.academicYearId, feeStructures.feeTypeId, feeStructures.id], name: 'finance_charges_structure_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.batchId], foreignColumns: [financeBatches.schoolId, financeBatches.id], name: 'finance_charges_batch_fk' }).onDelete('restrict'),
  index('finance_charges_school_year_due_idx').on(t.schoolId, t.academicYearId, t.dueDate, t.id),
  check('finance_charges_money_check', sql`${t.currency} in ('MAD','EUR','USD','GBP') and ${t.originalCents} between 1 and 999999999 and ${t.reductionCents}>=0 and ${t.reductionCents}<=${t.originalCents} and ${t.allocatedCents}>=0 and ${t.allocatedCents}<=${t.originalCents}-${t.reductionCents}`),
  check('finance_charges_state_check', sql`${t.status} in ('OPEN','CANCELLED') and (${t.status}<>'CANCELLED' or ${t.allocatedCents}=0)`),
  check('finance_charges_period_check', sql`${t.period}='once' or ${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]).enableRLS();

export const financePayments = pgTable('finance_payments', {
  id: uuid('id').primaryKey(), schoolId: uuid('school_id').notNull(), studentId: uuid('student_id').notNull(),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(),
  receiptReference: text('receipt_reference').notNull(), schoolName: text('school_name').notNull(), schoolTimezone: text('school_timezone').notNull(), studentName: text('student_name').notNull(),
  method: text('method').$type<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>().notNull(), amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('MAD'), receivedOn: date('received_on').notNull(), reference: text('reference'),
  recordedBy: uuid('recorded_by').notNull(), recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.schoolId, t.currency], foreignColumns: [schools.id, schools.financeCurrency], name: 'finance_payments_currency_fk' }).onDelete('restrict'),
  unique('finance_payments_currency_context_unique').on(t.schoolId, t.studentId, t.id, t.currency),
  unique('finance_payments_student_context_unique').on(t.schoolId, t.studentId, t.id),
  unique('finance_payments_request_unique').on(t.schoolId, t.requestKey),
  unique('finance_payments_receipt_unique').on(t.schoolId, t.receiptReference),
  foreignKey({ columns: [t.schoolId, t.studentId], foreignColumns: [students.schoolId, students.id], name: 'finance_payments_student_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.recordedBy], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_payments_actor_fk' }).onDelete('restrict'),
  index('finance_payments_student_date_idx').on(t.schoolId, t.studentId, t.receivedOn, t.id),
  check('finance_payments_values_check', sql`${t.currency} in ('MAD','EUR','USD','GBP') and ${t.amountCents} between 1 and 999999999 and ${t.method} in ('CASH','BANK_TRANSFER','CHEQUE') and (${t.reference} is null or length(${t.reference}) between 1 and 100)`),
]).enableRLS();

export const financeAllocations = pgTable('finance_payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(), studentId: uuid('student_id').notNull(),
  currency: text('currency').notNull().default('MAD'),
  paymentId: uuid('payment_id').notNull(), chargeId: uuid('charge_id').notNull(), amountCents: integer('amount_cents').notNull(),
  feeName: text('fee_name').notNull(), period: text('period').notNull(), dueDate: date('due_date').notNull(),
}, t => [
  foreignKey({ columns: [t.schoolId, t.studentId, t.paymentId, t.currency], foreignColumns: [financePayments.schoolId, financePayments.studentId, financePayments.id, financePayments.currency], name: 'finance_allocations_payment_currency_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.studentId, t.chargeId, t.currency], foreignColumns: [studentCharges.schoolId, studentCharges.studentId, studentCharges.id, studentCharges.currency], name: 'finance_allocations_charge_currency_fk' }).onDelete('restrict'),
  unique('finance_allocations_charge_unique').on(t.paymentId, t.chargeId),
  foreignKey({ columns: [t.schoolId, t.studentId, t.paymentId], foreignColumns: [financePayments.schoolId, financePayments.studentId, financePayments.id], name: 'finance_allocations_payment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.studentId, t.chargeId], foreignColumns: [studentCharges.schoolId, studentCharges.studentId, studentCharges.id], name: 'finance_allocations_charge_fk' }).onDelete('restrict'),
  index('finance_allocations_charge_idx').on(t.schoolId, t.chargeId),
  check('finance_allocations_amount_check', sql`${t.amountCents} between 1 and 999999999`),
]).enableRLS();

export const financeReversals = pgTable('finance_payment_reversals', {
  id: uuid('id').primaryKey(), schoolId: uuid('school_id').notNull(), studentId: uuid('student_id').notNull(), paymentId: uuid('payment_id').notNull(),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(), reversalReference: text('reversal_reference').notNull(),
  reason: text('reason').notNull(), reversedBy: uuid('reversed_by').notNull(), reversedAt: timestamp('reversed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('finance_reversals_payment_unique').on(t.paymentId),
  unique('finance_reversals_request_unique').on(t.schoolId, t.requestKey),
  unique('finance_reversals_reference_unique').on(t.schoolId, t.reversalReference),
  foreignKey({ columns: [t.schoolId, t.studentId, t.paymentId], foreignColumns: [financePayments.schoolId, financePayments.studentId, financePayments.id], name: 'finance_reversals_payment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.reversedBy], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_reversals_actor_fk' }).onDelete('restrict'),
  check('finance_reversals_reason_check', sql`length(btrim(${t.reason})) between 1 and 500`),
]).enableRLS();

export const financeChargeEvents = pgTable('finance_charge_events', {
  id: uuid('id').primaryKey().defaultRandom(), schoolId: uuid('school_id').notNull(), chargeId: uuid('charge_id').notNull(),
  requestKey: uuid('request_key').notNull(), requestHash: text('request_hash').notNull(),
  kind: text('kind').$type<'REDUCTION' | 'CANCELLATION'>().notNull(), reason: text('reason').notNull(),
  beforeCents: integer('before_cents').notNull(), afterCents: integer('after_cents').notNull(), actorId: uuid('actor_id').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('finance_events_request_unique').on(t.schoolId, t.requestKey),
  foreignKey({ columns: [t.schoolId, t.chargeId], foreignColumns: [studentCharges.schoolId, studentCharges.id], name: 'finance_events_charge_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.schoolId, t.actorId], foreignColumns: [schoolMemberships.schoolId, schoolMemberships.userId], name: 'finance_events_actor_fk' }).onDelete('restrict'),
  index('finance_events_charge_idx').on(t.schoolId, t.chargeId, t.occurredAt),
  check('finance_events_values_check', sql`${t.kind} in ('REDUCTION','CANCELLATION') and length(btrim(${t.reason})) between 1 and 500 and ${t.beforeCents}>=${t.afterCents} and ${t.afterCents}>=0`),
]).enableRLS();
