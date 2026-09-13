import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import {
  RecoveryError,
  isPostgresConnectionLoss,
  isPostgresTimeout,
  postgresDiagnostic,
  type RecoveryFailureCode,
  type RecoveryPhase,
} from './contracts';

export type QueryClient = Pick<PoolClient, 'query'>;

function assertSnapshotToken(value: unknown, phase: RecoveryPhase): string {
  if (typeof value !== 'string' || !/^[A-Fa-f0-9-]{8,128}$/.test(value)) {
    throw new RecoveryError(
      phase === 'snapshot_import' ? 'BACKUP_SNAPSHOT_IMPORT_FAILED' : 'BACKUP_SNAPSHOT_EXPORT_FAILED',
      'PostgreSQL returned an invalid snapshot.',
      { phase, timeout: false },
    );
  }
  return value;
}

async function databasePhase<T>(
  phase: RecoveryPhase,
  code: RecoveryFailureCode,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(
      isPostgresTimeout(error) ? 'BACKUP_OPERATION_TIMEOUT' : code,
      isPostgresTimeout(error)
        ? 'The database recovery phase timed out.'
        : 'The database recovery phase failed.',
      postgresDiagnostic(error, phase),
    );
  }
}

export async function withSnapshotConsumer<T>(
  pool: Pick<Pool, 'connect'>,
  snapshot: string,
  consume: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const token = assertSnapshotToken(snapshot, 'snapshot_import');
  const client = await databasePhase(
    'snapshot_consumer_connection',
    'BACKUP_DB_CONNECTION_FAILED',
    () => pool.connect(),
  );
  try {
    await databasePhase('read_only_transaction', 'BACKUP_READ_ONLY_TRANSACTION_FAILED', () =>
      client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    );
    await databasePhase('snapshot_import', 'BACKUP_SNAPSHOT_IMPORT_FAILED', () =>
      client.query(`SET TRANSACTION SNAPSHOT '${token}'`),
    );
    await databasePhase('snapshot_consumer_query', 'BACKUP_SNAPSHOT_CONSUMER_FAILED', () =>
      client.query("SET LOCAL TIME ZONE 'UTC'"),
    );
    const result = await databasePhase(
      'snapshot_consumer_query',
      'BACKUP_SNAPSHOT_CONSUMER_FAILED',
      () => consume(client),
    );
    await databasePhase('coordinator_commit', 'BACKUP_SNAPSHOT_COORDINATOR_LOST', () =>
      client.query('COMMIT'),
    );
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
  const coordinator = await databasePhase(
    'coordinator_connection',
    'BACKUP_DB_CONNECTION_FAILED',
    () => pool.connect(),
  );
  try {
    await databasePhase('read_only_transaction', 'BACKUP_READ_ONLY_TRANSACTION_FAILED', () =>
      coordinator.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    );
    await databasePhase('read_only_transaction', 'BACKUP_READ_ONLY_TRANSACTION_FAILED', () =>
      coordinator.query("SET LOCAL TIME ZONE 'UTC'"),
    );
    const result = await databasePhase(
      'snapshot_export',
      'BACKUP_SNAPSHOT_EXPORT_FAILED',
      () => coordinator.query<{ snapshot: string; timestamp: string }>(
        `select pg_export_snapshot() as snapshot,
                transaction_timestamp() at time zone 'UTC' as timestamp`,
      ),
    );
    const row = result.rows[0];
    const snapshot = assertSnapshotToken(row?.snapshot, 'snapshot_export');
    if (!row?.timestamp) {
      throw new RecoveryError(
        'BACKUP_SNAPSHOT_EXPORT_FAILED',
        'Snapshot timestamp was unavailable.',
        { phase: 'snapshot_export', timeout: false },
      );
    }
    const value = await consume({
      snapshot,
      timestamp: new Date(row.timestamp).toISOString(),
      coordinator,
    });
    await databasePhase('coordinator_commit', 'BACKUP_SNAPSHOT_COORDINATOR_LOST', () =>
      coordinator.query('COMMIT'),
    );
    return value;
  } catch (error) {
    await coordinator.query('ROLLBACK').catch(() => undefined);
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(
      isPostgresConnectionLoss(error)
        ? 'BACKUP_SNAPSHOT_COORDINATOR_LOST'
        : 'BACKUP_SNAPSHOT_CONSUMER_FAILED',
      'The snapshot consumer failed.',
      postgresDiagnostic(error, 'snapshot_consumer_query'),
    );
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
