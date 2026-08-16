import { z } from 'zod';

/**
 * Optional environment string.
 *
 * Optional variables are routinely left blank in `.env` files (e.g.
 * `SENTRY_DSN=`). An empty value is treated as "not configured" instead of
 * failing validation, so the build only fails on genuinely required values.
 */
const optionalString = (schema: z.ZodString) =>
  z.preprocess((value: unknown) => (value === '' ? undefined : value), schema.optional());

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
  SUPABASE_SERVICE_ROLE_KEY: optionalString(z.string().min(1)),

  // Database (Postgres / Supabase connection string)
  DATABASE_URL: z.string().url(),

  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: optionalString(z.string().url()),

  // Cloudflare R2 (file storage)
  R2_ACCOUNT_ID: optionalString(z.string()),
  R2_ACCESS_KEY_ID: optionalString(z.string()),
  R2_SECRET_ACCESS_KEY: optionalString(z.string()),
  R2_BUCKET: optionalString(z.string()),

  // Observability
  SENTRY_DSN: optionalString(z.string().url()),
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
  NEXT_PUBLIC_APP_URL: optionalString(z.string().url()),
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
