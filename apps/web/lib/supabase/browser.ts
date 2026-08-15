import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { clientEnv } from '@/lib/config/env';

/**
 * Browser Supabase client factory.
 *
 * Uses only the public anon key — never the service-role key. Intended for
 * client components and client-only flows.
 */
let cachedClient: SupabaseClient | undefined;

export function getBrowserSupabase(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createBrowserClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return cachedClient;
}
