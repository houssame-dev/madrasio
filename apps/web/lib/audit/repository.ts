import 'server-only';
import { and, count, desc, eq } from 'drizzle-orm';
import { auditEvents } from '@school/database';
import type * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type AuditDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export type AuditTransaction = Parameters<Parameters<AuditDb['transaction']>[0]>[0];

// Intentionally no update/delete repository functions.
export async function appendAuditEvent(
  tx: AuditTransaction,
  event: typeof auditEvents.$inferInsert,
) {
  await tx.insert(auditEvents).values(event);
}

export async function listSchoolAuditEvents(
  db: AuditDb,
  schoolId: string,
  page: number,
  pageSize: number,
) {
  const condition = and(eq(auditEvents.scope, 'SCHOOL'), eq(auditEvents.schoolId, schoolId));
  const data = await db
    .select()
    .from(auditEvents)
    .where(condition)
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ value: count() }).from(auditEvents).where(condition);
  return { data, meta: { page, pageSize, total: total.value } };
}
