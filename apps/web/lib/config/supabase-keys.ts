/** Prevent an elevated credential from being selected as a browser/session API key. */
export function assertPublicSupabaseKey(key: string | undefined): void {
  if (!key) return;
  let elevated = key.startsWith('sb_secret_');
  const payload = key.split('.')[1];
  if (payload) {
    try {
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
      elevated ||= claims.role === 'service_role';
    } catch { /* Opaque public keys and inert build fixtures are not JWTs. */ }
  }
  if (elevated) throw new Error('Elevated Supabase credentials cannot be public configuration.');
}

/** Resolve only the final modern Supabase API-key contract. */
export function resolveSupabaseKeys(env: Record<string, string | undefined>) {
  const present = (value: string | undefined) => value?.trim() || undefined;
  const publishableKey = present(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assertPublicSupabaseKey(publishableKey);
  return {
    publishableKey,
    secretKey: present(env.SUPABASE_SECRET_KEY),
  };
}
