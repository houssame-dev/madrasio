/**
 * Canonical server logout endpoint.
 *
 * Supabase owns the authentication session. The application additionally owns
 * the current-school selector, so a successful logout clears both server-side
 * auth cookies and `sms_current_school` before the client discards its cache.
 */

import { toApiErrorResponse } from '@/lib/api/errors';
import { clearSelectedSchoolId } from '@/lib/auth/current-school';
import { InternalError } from '@/lib/errors';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    await clearSelectedSchoolId();
    if (error) throw new InternalError('Logout could not be completed.', error);

    return Response.json({ data: { signedOut: true } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
