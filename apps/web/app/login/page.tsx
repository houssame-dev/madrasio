import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect('/dashboard');
  } catch (error) {
    // Next.js redirects are implemented as thrown control-flow errors.
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    // A failed anonymous session check must not make the public login route unusable.
  }

  return <LoginForm />;
}
