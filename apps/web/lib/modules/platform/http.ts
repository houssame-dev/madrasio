import 'server-only';
import { getDb } from '@/lib/db/client';
import { getAuthenticatedUserId } from '@/lib/auth/server-auth';
import { getAuthAdmin } from '@/lib/auth/admin';
import { recoveryCallbackUrl } from '@/lib/auth/recovery';
import { getServerEnv } from '@/lib/config/env';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { toApiErrorResponse } from '@/lib/api/errors';
import type { AuthDb } from '@/lib/auth/current-context';

export async function platformResponse(
  operation: (db: AuthDb, actorId: string) => Promise<unknown>,
) {
  try {
    const actorId = await getAuthenticatedUserId();
    const db = getDb();
    await requirePlatformAuthority(db, actorId);
    return Response.json(await operation(db, actorId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const response = toApiErrorResponse(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
export function platformInviteDependencies(db: AuthDb) {
  return {
    db,
    authAdmin: getAuthAdmin(),
    inviteRedirectTo: recoveryCallbackUrl(getServerEnv().APP_URL),
  };
}
