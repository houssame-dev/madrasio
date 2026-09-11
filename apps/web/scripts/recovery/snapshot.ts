import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { RecoveryError } from './contracts';

export type QueryClient = Pick<PoolClient, 'query'>;

function assertSnapshotToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Fa-f0-9-]{8,128}$/.test(value)) {
    throw new RecoveryError('BACKUP_SNAPSHOT_FAILED', 'PostgreSQL returned an invalid snapshot.');
  }
  return value;
}

export async function withSnapshotConsumer<T>(
  pool: Pick<Pool, 'connect'>,
  snapshot: string,
  consume: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const token = assertSnapshotToken(snapshot);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET TRANSACTION SNAPSHOT '${token}'`);
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await consume(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withExportedSnapshot<T>(
  pool: Pick<Pool, 'connect'>,
  consume: (context: {
    snapshot: string;
    timestamp: string;
    coordinator: QueryClient;
  }) => Promise<T>,
): Promise<T> {
  const coordinator = await pool.connect();
  try {
    await coordinator.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await coordinator.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await coordinator.query<{ snapshot: string; timestamp: string }>(
      `select pg_export_snapshot() as snapshot,
              transaction_timestamp() at time zone 'UTC' as timestamp`,
    );
    const row = result.rows[0];
    const snapshot = assertSnapshotToken(row?.snapshot);
    if (!row?.timestamp) {
      throw new RecoveryError('BACKUP_SNAPSHOT_FAILED', 'Snapshot timestamp was unavailable.');
    }
    const value = await consume({
      snapshot,
      timestamp: new Date(row.timestamp).toISOString(),
      coordinator,
    });
    await coordinator.query('COMMIT');
    return value;
  } catch (error) {
    await coordinator.query('ROLLBACK').catch(() => undefined);
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError('BACKUP_SNAPSHOT_FAILED', 'The consistent backup snapshot failed.');
  } finally {
    coordinator.release();
  }
}

export async function queryRows<T extends QueryResultRow>(
  client: QueryClient,
  sql: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return client.query<T>(sql, values);
}
