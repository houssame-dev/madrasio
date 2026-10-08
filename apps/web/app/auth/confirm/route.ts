import { NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';
import { recoveryCallbackUrl } from '@/lib/auth/recovery';
import { getServerEnv } from '@/lib/config/env';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const destination = new URL('/auth/set-password', recoveryCallbackUrl(getServerEnv().APP_URL));
  const invalidCode = type === 'recovery' ? 'invalid-recovery' : 'invalid-invite';

  if (!tokenHash || tokenHash.length > 2048 || (type !== 'invite' && type !== 'recovery')) {
    destination.searchParams.set('error', invalidCode);
    return NextResponse.redirect(destination, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const supabase = await getServerSupabase();
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (result.error || !result.data.session) destination.searchParams.set('error', invalidCode);
  } catch {
    destination.searchParams.set('error', invalidCode);
  }
  return NextResponse.redirect(destination, { headers: { 'Cache-Control': 'private, no-store' } });
}
