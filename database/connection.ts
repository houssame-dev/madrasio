import type { PoolConfig } from 'pg';

/** Verified TLS for remote PostgreSQL; plain transport is limited to loopback tests. */
export function postgresConnectionConfig(connectionString: string, ca?: string): PoolConfig {
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && !ca && !url.searchParams.has('sslmode')) return { connectionString };
  if (url.searchParams.get('sslmode') === 'disable') {
    throw new Error('Remote PostgreSQL requires verified TLS.');
  }
  // pg-connection-string must not override the explicit verified TLS object.
  // Reject file/compatibility knobs: certificates are supplied only through CA config.
  for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
    if (url.searchParams.has(key)) throw new Error('Unsupported PostgreSQL TLS configuration.');
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('ssl');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca?.trim() ? { ca: ca.replace(/\\n/g, '\n') } : {}) },
  };
}

/** drizzle-kit 0.28 ignores `ssl` beside a `url`; use its structured credentials. */
export function postgresMigrationCredentials(connectionString: string, ca?: string) {
  const config = postgresConnectionConfig(connectionString, ca);
  const url = new URL(config.connectionString!);
  if ([...url.searchParams].length) throw new Error('Unsupported migration connection parameters.');
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: config.ssl || false,
  };
}
