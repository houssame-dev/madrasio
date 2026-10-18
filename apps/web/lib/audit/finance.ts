import 'server-only';
import { z } from 'zod';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { appendAuditEvent, type AuditTransaction } from './repository';
import { AuditPersistenceError } from './service';
const base = { studentId: z.string().uuid(), requestKey: z.string().uuid(), amountCents: z.number().int().positive().max(999999999) };
const eventSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('FinancePaymentRecorded'), resourceId: z.string().uuid(), metadata: z.object({ ...base, method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE']) }).strict() }).strict(),
  z.object({ action: z.literal('FinancePaymentReversed'), resourceId: z.string().uuid(), metadata: z.object({ ...base, reversalId: z.string().uuid() }).strict() }).strict(),
]);
/** Domain reasons/references stay on private history, never in audit metadata. */
export async function recordFinanceAudit(tx: AuditTransaction, actor: { userId: string | null; schoolId: string }, event: z.infer<typeof eventSchema>) {
  const parsed = eventSchema.parse(event);
  await requireOperation(tx as unknown as AuthorizationDb, actor, { permission: 'finance.manage', scope: { kind: 'school' } });
  try {
    await appendAuditEvent(tx, { ...parsed, scope: 'SCHOOL', schoolId: actor.schoolId, actorKind: 'USER', actorUserId: actor.userId!, systemActor: null,
      resourceType: 'FinancePayment', metadata: Object.fromEntries(Object.entries(parsed.metadata).map(([k, v]) => [k, String(v)])) });
  } catch { throw new AuditPersistenceError(); }
}
