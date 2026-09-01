import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processOutbox: vi.fn(),
  processScheduled: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/modules/notifications/application', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  processRetryableOutboxEvents: mocks.processOutbox,
}));
vi.mock('@/lib/modules/announcements/application', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  processDueAnnouncementPublicationsBatch: mocks.processScheduled,
}));

import { GET as outboxGET, POST as outboxPOST } from '@/app/api/internal/jobs/process-outbox/route';
import { GET as scheduledGET, POST as scheduledPOST } from '@/app/api/internal/jobs/process-scheduled-announcements/route';

const secret = 'task-044-test-machine-secret-at-least-32-chars';

function request(path: string, authorization?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      cookie: 'sb-session=a-browser-session-is-not-authority',
    },
  });
}

beforeAll(() => {
  process.env.CRON_SECRET = secret;
});

beforeEach(() => {
  mocks.processOutbox.mockReset().mockResolvedValue({
    attempted: 2, processed: 2, failed: 0, pending: 0, remaining: 0,
    results: [{ eventId: 'private', eventType: 'private', notificationsCreated: 1 }],
  });
  mocks.processScheduled.mockReset().mockResolvedValue({
    attempted: 1, published: 1, failed: 0, remaining: 0,
    results: [{ publicationId: 'private', published: true }],
  });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('protected internal job routes', () => {
  it('rejects missing, malformed, and incorrect machine credentials without processing', async () => {
    for (const authorization of [undefined, 'Basic nope', 'Bearer wrong']) {
      const response = await outboxPOST(request('/api/internal/jobs/process-outbox', authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
      });
    }
    expect(mocks.processOutbox).not.toHaveBeenCalled();
  });

  it('does not treat a logged-in browser cookie as machine authority', async () => {
    const response = await scheduledPOST(request('/api/internal/jobs/process-scheduled-announcements'));
    expect(response.status).toBe(401);
    expect(mocks.processScheduled).not.toHaveBeenCalled();
  });

  it('accepts the exact bearer secret and returns only safe aggregates', async () => {
    const response = await outboxPOST(request('/api/internal/jobs/process-outbox', `Bearer ${secret}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: { attempted: 2, processed: 2, failed: 0, pending: 0, remaining: 0 } });
    expect(JSON.stringify(body)).not.toContain('private');
    expect(mocks.processOutbox).toHaveBeenCalledOnce();
  });

  it('authenticates the scheduled endpoint with the same server-only contract', async () => {
    const response = await scheduledPOST(request('/api/internal/jobs/process-scheduled-announcements', `Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { attempted: 1, published: 1, failed: 0, remaining: 0 } });
    expect(mocks.processScheduled).toHaveBeenCalledOnce();
  });

  it('GET is a side-effect-free 405 for both routes', async () => {
    const outbox = outboxGET();
    const scheduled = scheduledGET();
    expect(outbox.status).toBe(405);
    expect(scheduled.status).toBe(405);
    expect(outbox.headers.get('allow')).toBe('POST');
    expect(mocks.processOutbox).not.toHaveBeenCalled();
    expect(mocks.processScheduled).not.toHaveBeenCalled();
  });
});
