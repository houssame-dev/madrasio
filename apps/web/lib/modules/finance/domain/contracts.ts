import { z } from 'zod';
import { ValidationError } from '@/lib/errors';

export const centsSchema = z.number().int().min(1).max(999999999);
export const dateSchema = z.string().date();
export const feeTypeSchema = z.object({ name: z.string().trim().min(1).max(100), active: z.boolean().optional() }).strict();
export const periodSchema = z.object({ period: z.string().regex(/^(once|\d{4}-(0[1-9]|1[0-2]))$/), dueDate: dateSchema }).strict();
export const structureSchema = z.object({ feeTypeId: z.string().uuid(), academicYearId: z.string().uuid(),
  levelId: z.string().uuid().nullable().default(null), cadence: z.enum(['MONTHLY', 'ONCE']),
  amountCents: centsSchema, periods: z.array(periodSchema).min(1).max(36) }).strict();
export const structurePatchSchema = z.object({ amountCents: centsSchema, periods: z.array(periodSchema).min(1).max(36),
  active: z.boolean(), revision: z.number().int().positive() }).strict();
const selection = z.object({ structureId: z.string().uuid(), studentIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  classId: z.string().uuid().optional(), levelId: z.string().uuid().optional(), periods: z.array(z.string().regex(/^(once|\d{4}-(0[1-9]|1[0-2]))$/)).min(1).max(36) }).strict();
function oneSelection(v: z.infer<typeof selection>) { return Number(!!v.studentIds) + Number(!!v.classId) + Number(!!v.levelId) === 1 && new Set(v.periods).size === v.periods.length && (!v.studentIds || new Set(v.studentIds).size === v.studentIds.length); }
export const previewSchema = selection.refine(oneSelection, 'Select students, one class or one level.');
export const generateSchema = selection.extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().uuid() }).strict().refine(oneSelection, 'Invalid selection.');
export const adjustmentSchema = z.object({ requestKey: z.string().uuid(), kind: z.enum(['REDUCTION', 'CANCELLATION']), amountCents: centsSchema.optional(), reason: z.string().trim().min(1).max(500) }).strict()
  .refine(v => v.kind === 'REDUCTION' ? !!v.amountCents : v.amountCents === undefined, 'Amount is required only for reductions.');
export type ChargeSelection = z.infer<typeof previewSchema>;
export type GenerateInput = z.infer<typeof generateSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export const reductionCorrectionSchema = z.object({ requestKey: z.string().uuid(), expectedEventId: z.string().uuid(),
  kind: z.enum(['REDUCTION_EDIT', 'REDUCTION_CANCEL']), amountCents: centsSchema.optional(),
  reason: z.string().trim().min(1).max(500), confirmed: z.literal(true) }).strict()
  .refine(v => v.kind === 'REDUCTION_EDIT' ? v.amountCents !== undefined : v.amountCents === undefined, 'Amount is required only for editing.');

export const paymentSchema = z.object({
  requestKey: z.string().uuid(), confirmed: z.literal(true), studentId: z.string().uuid(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE']), amountCents: centsSchema, receivedOn: dateSchema,
  reference: z.string().trim().max(100).optional(),
  allocations: z.array(z.object({ chargeId: z.string().uuid(), amountCents: centsSchema }).strict()).min(1).max(500),
}).strict().refine(v => new Set(v.allocations.map(a => a.chargeId)).size === v.allocations.length && v.allocations.reduce((n, a) => n + a.amountCents, 0) === v.amountCents, 'Allocate exactly the received amount to unique charges.');
export const reversalSchema = z.object({ requestKey: z.string().uuid(), confirmed: z.literal(true), reason: z.string().trim().min(1).max(500) }).strict();

/** Decimal text, never floating point multiplication. */
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new ValidationError('Invalid two-decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  return centsSchema.parse(Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))));
}
export function validatePeriods(cadence: 'MONTHLY' | 'ONCE', periods: z.infer<typeof periodSchema>[], year: { startDate: string; endDate: string }) {
  if (new Set(periods.map(p => p.period)).size !== periods.length) throw new ValidationError('Duplicate periods.');
  if (cadence === 'ONCE' && (periods.length !== 1 || periods[0].period !== 'once')) throw new ValidationError('One-time fees require one due date.');
  for (const p of periods) {
    if (p.dueDate < year.startDate || p.dueDate > year.endDate || (cadence === 'MONTHLY' &&
      (p.period === 'once' || p.period < year.startDate.slice(0, 7) || p.period > year.endDate.slice(0, 7)))) throw new ValidationError('Period or due date outside academic year.');
  }
}
export function schoolToday(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
