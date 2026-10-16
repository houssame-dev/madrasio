import { getServerSupabase } from '@/lib/supabase/server';
import { SetPasswordPresentation } from '@/components/language/auth-presentation';

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  let authenticated = false;
  try {
    const user = await (await getServerSupabase()).auth.getUser();
    authenticated = !user.error && !!user.data.user;
  } catch {
    /* Invalid/expired sessions and transport failures share safe recovery guidance. */
  }
  const invalid = !!params.error || !authenticated;
  return <SetPasswordPresentation invalid={invalid} />;
}
