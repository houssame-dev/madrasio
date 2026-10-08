import { z } from 'zod';
import { getServerEnv } from '@/lib/config/env';
import { getAuthAdmin } from '@/lib/auth/admin';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { normalizeEmail } from '@/lib/auth/email';
import { getRecoveryDelivery, recoveryCallbackUrl } from '@/lib/auth/recovery';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import { logServerEvent } from '@/lib/observability/logger';
import { recoverProfileAccount } from '@/lib/modules/user-provisioning/application/recover-account';
import type { ProfileKind } from '@/lib/modules/user-provisioning/domain/contracts';
import { parseBody, toApiErrorResponse } from './errors';

const emailRequest = z.object({ email: z.string().trim().email().max(254) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
export async function recoveryPOST(request: Request) {
  // No identity lookup/timing branch. Provider owns rate limits and email eligibility.
  try {
    const input = await parseBody(request, emailRequest);
    await getRecoveryDelivery().request(
      normalizeEmail(input.email),
      recoveryCallbackUrl(getServerEnv().APP_URL),
    );
  } catch {
    // Never pass provider/request objects to logging.
    logServerEvent('warn', 'account_recovery_request_unavailable', {
      category: 'provider_failure',
    });
  }
  return Response.json({ data: { state: 'REQUESTED' } }, { headers });
}
export function profileRecoveryPOST(kind: ProfileKind) {
  return async (request: Request, context: { params: Promise<{ id: string }> }) => {
    try {
      await parseBody(request, z.object({}).strict());
      const id = z
        .string()
        .uuid()
        .safeParse((await context.params).id);
      if (!id.success) throw new ValidationError('Invalid profile identifier.');
      const db = getDb();
      const actor = await requireCurrentContext(db);
      const data = await recoverProfileAccount(
        {
          db,
          authAdmin: getAuthAdmin(),
          delivery: getRecoveryDelivery(),
          redirectTo: recoveryCallbackUrl(getServerEnv().APP_URL),
        },
        { userId: actor.userId, schoolId: actor.schoolContext!.schoolId },
        kind,
        id.data,
      );
      return Response.json({ data }, { headers });
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}
