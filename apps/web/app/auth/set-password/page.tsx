import Link from 'next/link';

import { SetPasswordForm } from '@/components/auth/set-password-form';
import { getServerSupabase } from '@/lib/supabase/server';

export default async function SetPasswordPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const user = await (await getServerSupabase()).auth.getUser();
  const invalid = params.error === 'invalid-invite' || !user.data.user;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="password-title">
        <h1 id="password-title" className="text-2xl font-semibold">Set your password</h1>
        {invalid ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">This invitation is invalid or has expired. Contact your School administrator for help.</p>
            <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/login">Return to sign in</Link>
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-4 text-sm text-muted-foreground">Choose a password to finish activating your account.</p>
            <SetPasswordForm />
          </div>
        )}
      </section>
    </main>
  );
}

