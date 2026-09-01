import { NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const destination = new URL('/auth/set-password', url.origin);

  if (!tokenHash || tokenHash.length > 2048 || type !== 'invite') {
    destination.searchParams.set('error', 'invalid-invite');
    return NextResponse.redirect(destination);
  }

  const supabase = await getServerSupabase();
  const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
  if (result.error) destination.searchParams.set('error', 'invalid-invite');
  return NextResponse.redirect(destination);
}

