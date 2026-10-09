import type { AuthAdminPort } from '@/lib/auth/admin';
import { normalizeEmail } from '@/lib/auth/email';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';

import type {
  InviteAccountInput, ProfileKind, ProvisionedAccount,
} from '../domain/contracts';
import * as repo from '../infrastructure/provisioning-repository';
import type { ProvisioningDb } from '../infrastructure/provisioning-repository';
import { ProvisioningError } from './provisioning-errors';
import { verifyApplicationIdentity, withProvisionedIdentity } from './identity';

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
  await verifyApplicationIdentity(deps.authAdmin, user);
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

  try {
    const outcome = await withProvisionedIdentity(deps, email, async (identity) => {
      if (identity.created) {
        await repo.createAndLinkIdentity(deps.db, {
          schoolId: actor.schoolId, profileId, kind, userId: identity.id, email: identity.email,
        });
        return 'INVITED' as const;
      }
      return repo.linkExistingIdentity(deps.db, {
        schoolId: actor.schoolId, profileId, kind, userId: identity.id,
      });
    });
    return { profileId, userId: outcome.userId, state: outcome.result };
  } catch (error) {
    if (error instanceof ProvisioningError) throw error;
    mapDbConflict(error);
  }
}
