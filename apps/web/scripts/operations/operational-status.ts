import type { PoolClient } from 'pg';

export const OPERATIONAL_STUCK_THRESHOLD_MINUTES = 5;

export interface OperationalStatus {
  migration: { count: number; latestAppliedAt: string | null };
  applicationTables: number;
  outbox: {
    pending: number;
    processing: number;
    stuckProcessing: number;
    processed: number;
    failed: number;
    retryable: number;
    repeatedAttempts: number;
    oldestRetryableAgeSeconds: number | null;
    lastProcessedAt: string | null;
  };
  notifications: { total: number; unread: number };
  scheduledPublications: {
    scheduled: number;
    overdue: number;
    nextScheduledAt: string | null;
  };
  cron: Array<{ job: string; active: boolean; latestStatus: string | null; latestRunAt: string | null }>;
}

type QueryClient = Pick<PoolClient, 'query'>;

/** Read-only, aggregate-only operational projection. No payload or person data. */
export async function collectOperationalStatus(client: QueryClient): Promise<OperationalStatus> {
  const migration = await client.query<{ count: number; latest_applied_at: string | null }>(
    `select count(*)::int as count, max(created_at)::text as latest_applied_at
     from drizzle.__drizzle_migrations`,
  );
  const tables = await client.query<{ count: number }>(
    `select count(*)::int as count
     from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const outbox = await client.query<{
    pending: number;
    processing: number;
    stuck_processing: number;
    processed: number;
    failed: number;
    retryable: number;
    repeated_attempts: number;
    oldest_retryable_age_seconds: number | null;
    last_processed_at: string | null;
  }>(
    `select
       count(*) filter (where status = 'PENDING')::int as pending,
       count(*) filter (where status = 'PROCESSING')::int as processing,
       count(*) filter (
         where status = 'PROCESSING'
           and updated_at <= now() - ($1::int * interval '1 minute')
       )::int as stuck_processing,
       count(*) filter (where status = 'PROCESSED')::int as processed,
       count(*) filter (where status = 'FAILED')::int as failed,
       count(*) filter (where status in ('PENDING', 'FAILED'))::int as retryable,
       count(*) filter (where attempt_count > 1)::int as repeated_attempts,
       extract(epoch from (now() - min(created_at) filter (where status in ('PENDING', 'FAILED'))))::int
         as oldest_retryable_age_seconds,
       max(processed_at)::text as last_processed_at
     from public.outbox_events`,
    [OPERATIONAL_STUCK_THRESHOLD_MINUTES],
  );
  const notifications = await client.query<{ total: number; unread: number }>(
    `select count(*)::int as total,
            count(*) filter (where read_at is null)::int as unread
     from public.notifications`,
  );
  const scheduled = await client.query<{
    scheduled: number;
    overdue: number;
    next_scheduled_at: string | null;
  }>(
    `select
       count(*) filter (where status = 'SCHEDULED')::int as scheduled,
       count(*) filter (
         where status = 'SCHEDULED'
           and scheduled_at <= now() - ($1::int * interval '1 minute')
       )::int as overdue,
       min(scheduled_at) filter (where status = 'SCHEDULED')::text as next_scheduled_at
     from public.announcement_publications`,
    [OPERATIONAL_STUCK_THRESHOLD_MINUTES],
  );
  const cron = await client.query<{
    jobname: string;
    active: boolean;
    latest_status: string | null;
    latest_run_at: string | null;
  }>(
    `select j.jobname, j.active, latest.status as latest_status,
            latest.start_time::text as latest_run_at
     from cron.job j
     left join lateral (
       select d.status, d.start_time
       from cron.job_run_details d
       where d.jobid = j.jobid
       order by d.start_time desc
       limit 1
     ) latest on true
     where j.jobname = any($1::text[])
     order by j.jobname`,
    [[
      'sms-staging-process-outbox',
      'sms-staging-process-scheduled-announcements',
    ]],
  );

  const outboxRow = outbox.rows[0];
  const notificationRow = notifications.rows[0];
  const scheduledRow = scheduled.rows[0];
  return {
    migration: {
      count: migration.rows[0]?.count ?? 0,
      latestAppliedAt: migration.rows[0]?.latest_applied_at ?? null,
    },
    applicationTables: tables.rows[0]?.count ?? 0,
    outbox: {
      pending: outboxRow?.pending ?? 0,
      processing: outboxRow?.processing ?? 0,
      stuckProcessing: outboxRow?.stuck_processing ?? 0,
      processed: outboxRow?.processed ?? 0,
      failed: outboxRow?.failed ?? 0,
      retryable: outboxRow?.retryable ?? 0,
      repeatedAttempts: outboxRow?.repeated_attempts ?? 0,
      oldestRetryableAgeSeconds: outboxRow?.oldest_retryable_age_seconds ?? null,
      lastProcessedAt: outboxRow?.last_processed_at ?? null,
    },
    notifications: {
      total: notificationRow?.total ?? 0,
      unread: notificationRow?.unread ?? 0,
    },
    scheduledPublications: {
      scheduled: scheduledRow?.scheduled ?? 0,
      overdue: scheduledRow?.overdue ?? 0,
      nextScheduledAt: scheduledRow?.next_scheduled_at ?? null,
    },
    cron: cron.rows.map((row) => ({
      job: row.jobname,
      active: row.active,
      latestStatus: row.latest_status,
      latestRunAt: row.latest_run_at,
    })),
  };
}

export function operationalFindings(status: OperationalStatus): string[] {
  const findings: string[] = [];
  if (status.outbox.failed > 0) findings.push('OUTBOX_FAILED_EVENTS');
  if (status.outbox.stuckProcessing > 0) findings.push('OUTBOX_STUCK_PROCESSING');
  if (
    status.outbox.oldestRetryableAgeSeconds !== null &&
    status.outbox.oldestRetryableAgeSeconds > OPERATIONAL_STUCK_THRESHOLD_MINUTES * 60
  ) findings.push('OUTBOX_OVERDUE');
  if (status.scheduledPublications.overdue > 0) findings.push('SCHEDULED_PUBLICATION_OVERDUE');
  if (status.cron.length !== 2) findings.push('CRON_JOB_INVENTORY_MISMATCH');
  if (status.cron.some((job) => !job.active || job.latestStatus !== 'succeeded')) {
    findings.push('CRON_JOB_UNHEALTHY');
  }
  return findings;
}
