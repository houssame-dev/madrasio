import { and, eq, gte, sql } from 'drizzle-orm';
import { auditEvents, users } from '@school/database';
import type { ProvisioningDb } from './provisioning-repository';
import { AccountRecoveryError } from '../application/recovery-errors';

/** Global identity lock serializes concurrent assistance across Schools without disclosing them. */
export async function reserveRecovery(
  db: ProvisioningDb,
  userId: string,
  record: (tx: ProvisioningDb) => Promise<void>,
) {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [recent] = await tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'AccountRecoveryRequested'),
          eq(auditEvents.resourceId, userId),
          gte(auditEvents.occurredAt, sql`now() - interval '60 seconds'`),
        ),
      )
      .limit(1);
    if (recent) throw new AccountRecoveryError('ACCOUNT_RECOVERY_COOLDOWN');
    await record(tx as ProvisioningDb);
  });
}
