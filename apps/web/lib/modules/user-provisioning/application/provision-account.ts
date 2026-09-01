import type { User } from '@supabase/supabase-js';

import type { AuthAdminPort } from '@/lib/auth/admin';
import { normalizeEmail } from '@/lib/auth/email';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';

import type {
  InviteAccountInput, ProfileKind, ProvisionedAccount,
} from '../domain/contracts';
import * as repo from '../infrastructure/provisioning-repository';
import type { ProvisioningDb } from '../infrastructure/provisioning-repository';
import { ProvisioningError } from './provisioning-errors';

export interface ProvisioningActor { userId: string | null; schoolId: string }
export interface ProvisioningDependencies {
  db: ProvisioningDb;
  authAdmin: AuthAdminPort;
  inviteRedirectTo: string;
}

function reconciliation(cause?: unknown): never {
  throw new ProvisioningError(
    'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED',
    'Account identity requires operator reconciliation before it can be linked.',
    cause,
  );
}

function verifiedAuthEmail(user: User | null, expectedEmail: string): void {
  if (!user?.email || normalizeEmail(user.email) !== expectedEmail) reconciliation();
}

function mapDbConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message === 'MEMBERSHIP_ROLE_CONFLICT') {
    throw new ProvisioningError('ACCOUNT_ROLE_CONFLICT', 'The account has an incompatible role in this School.');
  }
  if (message === 'PROFILE_LINK_CONFLICT') {
    throw new ProvisioningError('PROFILE_ACCOUNT_ALREADY_LINKED', 'The profile or account is already linked.');
  }
  reconciliation(error);
}

async function verifyExisting(
  deps: ProvisioningDependencies,
  user: { id: string; email: string; status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' },
) {
  if (user.status !== 'ACTIVE') reconciliation();
  let authUser: User | null;
  try {
    authUser = await deps.authAdmin.getUserById(user.id);
  } catch (error) {
    reconciliation(error);
  }
  verifiedAuthEmail(authUser!, user.email);
}

export async function provisionProfileAccount(
  deps: ProvisioningDependencies,
  actor: ProvisioningActor,
  kind: ProfileKind,
  profileId: string,
  input: InviteAccountInput,
): Promise<ProvisionedAccount> {
  await requireOperation(deps.db as unknown as AuthorizationDb, actor, {
    permission: kind === 'TEACHER' ? 'teachers.manage' : 'parents.manage',
    scope: { kind: 'school' },
  });
  const email = normalizeEmail(input.email);
  const profile = await repo.findProfile(deps.db, actor.schoolId, kind, profileId);
  if (!profile) throw new ProvisioningError('PROFILE_NOT_FOUND', 'Profile was not found.');
  if (profile.status !== 'ACTIVE') {
    throw new ProvisioningError('PROFILE_NOT_ACTIVE', 'Only an ACTIVE profile may receive account access.');
  }

  if (profile.userId) {
    const linkedUser = await repo.findUser(deps.db, profile.userId);
    if (!linkedUser) reconciliation();
    await verifyExisting(deps, linkedUser);
    if (linkedUser.email !== email) {
      throw new ProvisioningError('PROFILE_ACCOUNT_ALREADY_LINKED', 'This profile already has account access.');
    }
    try {
      const state = await repo.linkExistingIdentity(deps.db, {
        schoolId: actor.schoolId, profileId, kind, userId: linkedUser.id,
        requireExistingMembership: true,
      });
      return { profileId, userId: linkedUser.id, state };
    } catch (error) {
      mapDbConflict(error);
    }
  }

  const existing = await repo.findUserByEmail(deps.db, email);
  if (existing) {
    await verifyExisting(deps, existing);
    try {
      const state = await repo.linkExistingIdentity(deps.db, {
        schoolId: actor.schoolId, profileId, kind, userId: existing.id,
      });
      return { profileId, userId: existing.id, state };
    } catch (error) {
      mapDbConflict(error);
    }
  }

  let invited: User;
  try {
    invited = await deps.authAdmin.inviteUserByEmail(email, deps.inviteRedirectTo);
  } catch (error) {
    throw new ProvisioningError(
      'ACCOUNT_INVITE_FAILED',
      'Account invitation could not be initiated. Contact an operator if the address already has an account.',
      error,
    );
  }
  if (!invited.email || normalizeEmail(invited.email) !== email) {
    try {
      await deps.authAdmin.deleteUser(invited.id);
    } catch (cleanupError) {
      throw new ProvisioningError(
        'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED',
        'Account provisioning requires operator reconciliation.',
        cleanupError,
      );
    }
    reconciliation();
  }

  try {
    await repo.createAndLinkIdentity(deps.db, {
      schoolId: actor.schoolId, profileId, kind, userId: invited.id, email,
    });
  } catch (dbError) {
    try {
      await deps.authAdmin.deleteUser(invited.id);
    } catch (cleanupError) {
      throw new ProvisioningError(
        'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED',
        'Account provisioning requires operator reconciliation.',
        { dbError, cleanupError },
      );
    }
    reconciliation(dbError);
  }
  return { profileId, userId: invited.id, state: 'INVITED' };
}
