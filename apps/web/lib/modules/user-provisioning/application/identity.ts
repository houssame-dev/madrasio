import 'server-only';
import type { AuthAdminPort } from '@/lib/auth/admin';
import { normalizeEmail } from '@/lib/auth/email';
import { AppError } from '@/lib/errors';
import {
  findUserByNormalizedEmail,
  type UserIdentityDb,
  type UserIdentityProjection,
} from '@/lib/auth/user-repository';
import { ProvisioningError } from './provisioning-errors';

export function identityReconciliation(): never {
  throw new ProvisioningError(
    'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED',
    'Account identity requires operator reconciliation.',
  );
}

export async function verifyApplicationIdentity(auth: AuthAdminPort, user: UserIdentityProjection) {
  if (user.status !== 'ACTIVE') identityReconciliation();
  const actual = await auth.getUserById(user.id).catch(() => null);
  if (
    !actual ||
    actual.id !== user.id ||
    !actual.email ||
    normalizeEmail(actual.email) !== user.email
  )
    identityReconciliation();
}

/** Shared invitation/identity boundary. Callers authorize and validate targets BEFORE entry.
 * commit must atomically persist its application state; only newly invited identities are compensated.
 */
export async function withProvisionedIdentity<T>(
  deps: { db: UserIdentityDb; authAdmin: AuthAdminPort; inviteRedirectTo: string },
  submittedEmail: string,
  commit: (identity: { id: string; email: string; created: boolean }) => Promise<T>,
): Promise<{ result: T; invited: boolean; userId: string }> {
  const email = normalizeEmail(submittedEmail);
  const existing = await findUserByNormalizedEmail(deps.db, email);
  if (existing) {
    await verifyApplicationIdentity(deps.authAdmin, existing);
    return {
      result: await commit({ ...existing, created: false }),
      invited: false,
      userId: existing.id,
    };
  }
  let invited;
  try {
    invited = await deps.authAdmin.inviteUserByEmail(email, deps.inviteRedirectTo);
  } catch {
    throw new ProvisioningError(
      'ACCOUNT_INVITE_FAILED',
      'Account invitation could not be initiated. Operator reconciliation may be required.',
    );
  }
  try {
    if (!invited.email || normalizeEmail(invited.email) !== email) identityReconciliation();
    return {
      result: await commit({ id: invited.id, email: normalizeEmail(invited.email), created: true }),
      invited: true,
      userId: invited.id,
    };
  } catch (error) {
    try {
      await deps.authAdmin.deleteUser(invited.id);
    } catch {
      throw new ProvisioningError(
        'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED',
        'Account provisioning requires operator reconciliation.',
      );
    }
    if (error instanceof AppError) throw error;
    identityReconciliation();
  }
}
