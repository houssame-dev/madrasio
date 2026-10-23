import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { LanguageSelector } from '@/components/language/language-selector';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Locale-neutral metadata cannot introduce a different server preference on refresh.
export const metadata: Metadata = { title: { absolute: 'Madrasio' } };

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

  return <><div className="flex flex-wrap items-center justify-end gap-3 p-3"><ThemeSelector /><LanguageSelector compact /></div><LoginForm /></>;
}
