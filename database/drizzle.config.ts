import { defineConfig } from 'drizzle-kit';
import { postgresMigrationCredentials } from './connection';

const migrationConnection = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
const connection = migrationConnection
  ? postgresMigrationCredentials(migrationConnection, process.env.DATABASE_SSL_CA)
  : undefined;

/**
 * Drizzle Kit configuration.
 *
 * This file wires the committed application schema to the migration
 * infrastructure (output directory, dialect). Hosted migration tooling must
 * use `MIGRATION_DATABASE_URL` (direct PostgreSQL, or the session pooler when
 * direct IPv6 is unavailable). The `DATABASE_URL` fallback preserves the
 * existing local/test workflow; hosted runtime traffic uses that variable for
 * the transaction pooler and must never run migrations.
 */
export default defineConfig({
  schema: './drizzle/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: connection || { url: '' },
  verbose: true,
  strict: true,
});
