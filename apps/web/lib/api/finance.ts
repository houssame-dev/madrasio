import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import * as finance from '@/lib/modules/finance/application/service';
import * as payments from '@/lib/modules/finance/application/payments';
import { adjustmentSchema, feeTypeSchema, generateSchema, previewSchema, structurePatchSchema, structureSchema, paymentSchema, reversalSchema, centsSchema } from '@/lib/modules/finance/domain/contracts';
import { parseBody, toApiErrorResponse } from './errors';
import { cookies } from 'next/headers';
import { cookieLocale, LOCALE_COOKIE } from '@/i18n/locale-cookie';
import { receiptDocument } from '@/lib/modules/finance/domain/receipt';
import { collectionsReport, outstandingReport, studentBalance, collectionFilters, outstandingFilters } from '@/lib/modules/finance/application/reports';
import { csvDocument, decimalMAD } from '@/lib/modules/finance/domain/csv';

type Params = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();
async function actor() {
  const db = getDb(); const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
/** Cookie-authenticated writes accept only the same origin; no wildcard or missing-Origin fallback. */
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { if (!origin || origin === 'null' || new URL(origin).origin !== origin || origin !== new URL(request.url).origin) throw new Error(); }
  catch { throw new ForbiddenError(); }
}
async function run(work: () => Promise<unknown>) {
  let response: Response;
  try { response = Response.json({ data: await work() }); }
  catch (error) { response = toApiErrorResponse(error instanceof z.ZodError ? new ValidationError('Invalid finance input.') : error); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie');
  return response;
}
export function stateGET(request: Request) { return run(async () => {
  const query = z.object({ academicYearId: uuid.optional(), studentId: uuid.optional(), status: z.enum(['OPEN', 'CANCELLED']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(100).default('') }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  const value = await actor(); return finance.listFinance(value.db, value.actor, query);
}); }
export function typePOST(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, feeTypeSchema); const v = await actor(); return finance.saveFeeType(v.db, v.actor, input); }); }
export function typePATCH(request: Request, context: Params) { return run(async () => { sameOrigin(request); const input = await parseBody(request, feeTypeSchema); const v = await actor(); return finance.saveFeeType(v.db, v.actor, input, uuid.parse((await context.params).id)); }); }
export function structurePOST(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, structureSchema); const v = await actor(); return finance.saveStructure(v.db, v.actor, input); }); }
export function structurePATCH(request: Request, context: Params) { return run(async () => { sameOrigin(request); const input = await parseBody(request, structurePatchSchema); const v = await actor(); return finance.saveStructure(v.db, v.actor, input, uuid.parse((await context.params).id)); }); }
export function previewPOST(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, previewSchema); const v = await actor(); return finance.previewCharges(v.db, v.actor, input); }); }
export function generatePOST(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, generateSchema); const v = await actor(); return finance.generateCharges(v.db, v.actor, input); }); }
export function chargeGET(_request: Request, context: Params) { return run(async () => { const v = await actor(); return finance.chargeDetail(v.db, v.actor, uuid.parse((await context.params).id)); }); }
export function adjustmentPOST(request: Request, context: Params) { return run(async () => { sameOrigin(request); const input = await parseBody(request, adjustmentSchema); const v = await actor(); return finance.adjustCharge(v.db, v.actor, uuid.parse((await context.params).id), input); }); }
export function paymentsGET(request: Request) { return run(async () => {
  const input = z.object({ studentId: uuid.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  const v = await actor(); return payments.paymentHistory(v.db, v.actor, input.studentId, input.page);
}); }
export function paymentStudentsGET(request: Request) { return run(async () => {
  const input = z.object({ search: z.string().trim().max(100).default('') }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  const v = await actor(); return payments.paymentStudents(v.db, v.actor, input.search);
}); }
export function paymentOptionsGET(request: Request) { return run(async () => {
  const input = z.object({ studentId: uuid, amountCents: z.coerce.number().pipe(centsSchema).optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  const v = await actor(); return payments.paymentOptions(v.db, v.actor, input.studentId, input.amountCents);
}); }
export function paymentPOST(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, paymentSchema); const v = await actor(); return payments.recordPayment(v.db, v.actor, input); }); }
export function paymentGET(_request: Request, context: Params) { return run(async () => { const v = await actor(); return payments.paymentDetail(v.db, v.actor, uuid.parse((await context.params).id)); }); }
export function reversalPOST(request: Request, context: Params) { return run(async () => { sameOrigin(request); const input = await parseBody(request, reversalSchema); const v = await actor(); return payments.reversePayment(v.db, v.actor, uuid.parse((await context.params).id), input); }); }
export async function receiptGET(request: Request, context: Params) {
  try {
    const query = z.object({ download: z.literal('1').optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const v = await actor(); const detail = await payments.paymentDetail(v.db, v.actor, uuid.parse((await context.params).id));
    const locale = cookieLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    const response = new Response(receiptDocument(detail, locale), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'X-Content-Type-Options': 'nosniff' } });
    if (query.download) response.headers.set('Content-Disposition', `attachment; filename="receipt-${detail.payment.id}.html"`);
    return response;
  } catch (error) { return run(async () => { throw error; }); }
}

function reportQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ValidationError('Repeated report parameter.');
  const { format, ...filters } = Object.fromEntries(params);
  if (format !== undefined && format !== 'csv') throw new ValidationError('Invalid report format.');
  return { exporting: format === 'csv', filters };
}
function csvResponse(rows: (string | number)[][], name: string) {
  return new Response(csvDocument(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}
export async function collectionsGET(request: Request) {
  try {
    const { exporting, filters } = reportQuery(request); const f = collectionFilters.parse(filters); const v = await actor();
    const report = await collectionsReport(v.db, v.actor, f, new Date(), exporting);
    if (!exporting) return run(async () => report);
    return csvResponse([
      ['Received date (inclusive)', 'Student', 'Method', 'Gross MAD', 'Net MAD', 'Receipt reference', 'Reversal reference', 'Reversed at (UTC)', 'From', 'To', 'Current state on', 'School timezone', 'Student filter'],
      ...report.items.map(p => [p.receivedOn, p.studentName, p.method, decimalMAD(p.amountCents), decimalMAD(p.reversalReference ? 0 : p.amountCents), p.receiptReference, p.reversalReference ?? '', p.reversedAt?.toISOString() ?? '', report.from, report.to, report.today, report.timezone, f.studentId ?? 'ALL']),
    ], 'finance-collections');
  } catch (error) { return run(async () => { throw error; }); }
}
export async function outstandingGET(request: Request) {
  try {
    const { exporting, filters } = reportQuery(request); const f = outstandingFilters.parse(filters); const v = await actor();
    const report = await outstandingReport(v.db, v.actor, f, new Date(), exporting);
    if (!exporting) return run(async () => report);
    return csvResponse([
      ['Student', 'Net charges MAD', 'Allocated MAD', 'Outstanding MAD', 'Not overdue MAD', '1-30 days MAD', '31-60 days MAD', '61+ days MAD', 'Current state on', 'School timezone', 'Academic year filter', 'Charge class filter', 'Student filter'],
      ...report.items.map(p => [p.studentName, decimalMAD(p.netCents), decimalMAD(p.paidCents), decimalMAD(p.outstandingCents), decimalMAD(p.notOverdueCents), decimalMAD(p.days1to30Cents), decimalMAD(p.days31to60Cents), decimalMAD(p.days61plusCents), report.today, report.timezone, f.academicYearId ?? 'ALL', f.classId ?? 'ALL', f.studentId ?? 'ALL']),
    ], 'finance-outstanding');
  } catch (error) { return run(async () => { throw error; }); }
}
export function balanceGET(request: Request, context: Params) { return run(async () => {
  const f = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  const v = await actor(); return studentBalance(v.db, v.actor, uuid.parse((await context.params).id), f.page);
}); }
