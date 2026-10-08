import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/config/env';

export interface RecoveryDelivery {
  request(email: string, redirectTo: string): Promise<void>;
}

/** Fixed application-owned destination; never derived from request headers/input. */
export function recoveryCallbackUrl(appUrl: string | undefined): string {
  if (!appUrl) throw new Error('Recovery origin is not configured.');
  const url = new URL(appUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  ) {
    throw new Error('Invalid recovery origin.');
  }
  return new URL('/auth/confirm', url).toString();
}

/** Public Auth key preserves provider email/IP limits; no Admin delivery bypass. */
export function getRecoveryDelivery(): RecoveryDelivery {
  const env = getServerEnv();
  const client = createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async request(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error('Recovery delivery unavailable.');
    },
  };
}
