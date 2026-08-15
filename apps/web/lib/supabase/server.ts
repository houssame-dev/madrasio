import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/config/env';

/**
 * Server-side Supabase client factory.
 *
 * Reads/writes session cookies via the Next.js cookies() API. Each call returns
 * a request-scoped client. This is the only sanctioned way for Server
 * Components / Route Handlers to talk to Supabase.
 *
 * The service-role key is intentionally not used here. Server-side authorization
 * is enforced by the application's own authorization pipeline.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Setting cookies from a Server Component is not allowed. This
          // branch is exercised when the client is constructed during render.
          // Route Handlers and Server Actions may set cookies successfully.
        }
      },
    },
  });
}
