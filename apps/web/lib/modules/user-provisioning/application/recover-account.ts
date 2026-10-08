import 'server-only';
import type { AuthAdminPort } from '@/lib/auth/admin';
import { normalizeEmail } from '@/lib/auth/email';
import type { RecoveryDelivery } from '@/lib/auth/recovery';
import { recordSchoolAudit } from '@/lib/audit/service';
import type { AuditTransaction } from '@/lib/audit/repository';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { AccountRecoveryError } from './recovery-errors';
import type { ProfileKind } from '../domain/contracts';
import * as repo from '../infrastructure/provisioning-repository';
import { reserveRecovery } from '../infrastructure/recovery-repository';
import type { ProvisioningActor } from './provision-account';

async function eligible(
  db: repo.ProvisioningDb,
  actor: ProvisioningActor,
  kind: ProfileKind,
  profileId: string,
) {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: kind === 'TEACHER' ? 'teachers.manage' : 'parents.manage',
    scope: { kind: 'school' },
  });
  const profile = await repo.findProfile(db, actor.schoolId, kind, profileId);
  if (!profile || profile.status !== 'ACTIVE' || !profile.userId)
    throw new AccountRecoveryError('ACCOUNT_RECOVERY_INELIGIBLE');
  const user = await repo.findUser(db, profile.userId);
  const membership = await repo.findMembership(db, actor.schoolId, profile.userId);
  if (
    !user ||
    user.status !== 'ACTIVE' ||
    membership?.status !== 'ACTIVE' ||
    membership.role !== kind ||
    (await repo.findOtherLinkedProfile(db, actor.schoolId, kind, profileId, profile.userId))
  ) {
    throw new AccountRecoveryError('ACCOUNT_RECOVERY_INELIGIBLE');
  }
  return user;
}

/** No account/link writes, no passwords, no invite creation, no automatic retry. */
export async function recoverProfileAccount(
  deps: {
    db: repo.ProvisioningDb;
    authAdmin: Pick<AuthAdminPort, 'getUserById'>;
    delivery: RecoveryDelivery;
    redirectTo: string;
  },
  actor: ProvisioningActor,
  kind: ProfileKind,
  profileId: string,
) {
  const user = await eligible(deps.db, actor, kind, profileId);
  const authUser = await deps.authAdmin.getUserById(user.id).catch(() => null);
  if (
    !authUser ||
    authUser.id !== user.id ||
    !authUser.email ||
    normalizeEmail(authUser.email) !== user.email
  ) {
    throw new AccountRecoveryError('ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED');
  }
  const state = authUser.email_confirmed_at ? 'CONFIRMED' : 'UNCONFIRMED';
  // Commit an authorized intent BEFORE external delivery. This is not a delivery-success record.
  await reserveRecovery(deps.db, user.id, async (tx) => {
    const current = await eligible(tx, actor, kind, profileId);
    if (current.id !== user.id || current.email !== user.email)
      throw new AccountRecoveryError('ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED');
    await recordSchoolAudit(tx as unknown as AuditTransaction, actor, {
      action: 'AccountRecoveryRequested',
      resourceId: user.id,
      metadata: { profileKind: kind, profileId, identityState: state },
    });
  });
  try {
    await deps.delivery.request(user.email, deps.redirectTo);
  } catch {
    throw new AccountRecoveryError('ACCOUNT_RECOVERY_DELIVERY_UNCERTAIN');
  }
  return { state: 'REQUESTED' as const };
}
