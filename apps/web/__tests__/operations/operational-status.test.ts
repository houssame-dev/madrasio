import { describe, expect, it, vi } from 'vitest';

import {
  collectOperationalStatus,
  operationalFindings,
} from '@/scripts/operations/operational-status';

function querySequence() {
  return vi.fn()
    .mockResolvedValueOnce({ rows: [{ count: 16, latest_applied_at: '2026-09-03T00:00:00Z' }] })
    .mockResolvedValueOnce({ rows: [{ count: 39 }] })
    .mockResolvedValueOnce({ rows: [{
      pending: 0,
      processing: 0,
      stuck_processing: 0,
      processed: 8,
      failed: 0,
      retryable: 0,
      repeated_attempts: 0,
      oldest_retryable_age_seconds: null,
      last_processed_at: '2026-09-03T01:00:00Z',
    }] })
    .mockResolvedValueOnce({ rows: [{ total: 8, unread: 0 }] })
    .mockResolvedValueOnce({ rows: [{
      scheduled: 1,
      overdue: 0,
      next_scheduled_at: '2027-06-15T12:00:00Z',
    }] })
    .mockResolvedValueOnce({ rows: [
      { jobname: 'sms-staging-process-outbox', active: true, latest_status: 'succeeded', latest_run_at: '2026-09-03T01:00:00Z' },
      { jobname: 'sms-staging-process-scheduled-announcements', active: true, latest_status: 'succeeded', latest_run_at: '2026-09-03T01:00:00Z' },
    ] });
}

describe('read-only operational status', () => {
  it('returns aggregate state without payload or person fields', async () => {
    const query = querySequence();
    const status = await collectOperationalStatus({ query } as never);
    expect(status).toMatchObject({
      migration: { count: 16 },
      applicationTables: 39,
      outbox: { processed: 8, retryable: 0 },
      notifications: { total: 8, unread: 0 },
      scheduledPublications: { scheduled: 1, overdue: 0 },
    });
    expect(status.cron).toHaveLength(2);
    expect(operationalFindings(status)).toEqual([]);
    expect(JSON.stringify(status)).not.toMatch(/payload|email|body|recipient/i);
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('classifies overdue and failed durable work plus unhealthy Cron', async () => {
    const query = querySequence();
    query.mockReset()
      .mockResolvedValueOnce({ rows: [{ count: 16, latest_applied_at: null }] })
      .mockResolvedValueOnce({ rows: [{ count: 39 }] })
      .mockResolvedValueOnce({ rows: [{ pending: 1, processing: 1, stuck_processing: 1, processed: 8, failed: 1, retryable: 2, repeated_attempts: 1, oldest_retryable_age_seconds: 601, last_processed_at: null }] })
      .mockResolvedValueOnce({ rows: [{ total: 8, unread: 0 }] })
      .mockResolvedValueOnce({ rows: [{ scheduled: 2, overdue: 1, next_scheduled_at: null }] })
      .mockResolvedValueOnce({ rows: [{ jobname: 'sms-staging-process-outbox', active: true, latest_status: 'failed', latest_run_at: null }] });
    const status = await collectOperationalStatus({ query } as never);
    expect(operationalFindings(status)).toEqual([
      'OUTBOX_FAILED_EVENTS',
      'OUTBOX_STUCK_PROCESSING',
      'OUTBOX_OVERDUE',
      'SCHEDULED_PUBLICATION_OVERDUE',
      'CRON_JOB_INVENTORY_MISMATCH',
      'CRON_JOB_UNHEALTHY',
    ]);
  });
});
