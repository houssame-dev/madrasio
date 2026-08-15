import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * The full domain schema is intentionally NOT defined yet — it will be added
 * by the dedicated database schema task. This file wires up the migration
 * infrastructure (output directory, dialect) and reads the connection string
 * from `DATABASE_URL`.
 */
export default defineConfig({
  schema: './drizzle/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
