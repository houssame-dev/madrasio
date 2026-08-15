import { z } from 'zod';

/**
 * Server-side environment schema.
 *
 * Server-only secrets (Supabase service role, R2, etc.) MUST live here and
 * MUST NEVER be referenced from client modules.
 */
const ServerEnvSchema = z.object({
  // Supabase server-side
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Database (Postgres / Supabase connection string)
  DATABASE_URL: z.string().url().optional(),

  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().optional(),

  // Cloudflare R2 (file storage)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
});

/**
 * Client-safe environment schema.
 *
 * Only values safe to expose to the browser live here. NEVER add a server
 * secret to this schema.
 */
const ClientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type ClientEnv = z.infer<typeof ClientEnvSchema>;

/**
 * Lazily parses the server env. Throws on misconfiguration so the server fails
 * fast on startup rather than at the first request.
 */
let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    const parsed = ServerEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // Don't leak field values. Just list the failing keys.
      const issues = parsed.error.issues.map((issue) => issue.path.join('.'));
      throw new Error(`Invalid server environment variables: ${issues.join(', ')}`);
    }
    cachedServerEnv = parsed.data;
  }
  return cachedServerEnv;
}

/**
 * Client-safe environment. The values come from `NEXT_PUBLIC_*` env vars,
 * which Next.js inlines at build time.
 */
export const clientEnv: ClientEnv = (() => {
  const parsed = ClientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  return parsed;
})();
