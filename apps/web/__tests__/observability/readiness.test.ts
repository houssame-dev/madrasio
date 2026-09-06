import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@/lib/db', () => ({ getDb: () => ({ execute: mocks.execute }) }));

import { dynamic, GET, runtime } from '@/app/api/health/ready/route';

afterEach(() => {
  mocks.execute.mockReset();
  vi.restoreAllMocks();
});

describe('database readiness route', () => {
  it('returns a minimal uncached ready response after one bounded query', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ ready: 1 }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(dynamic).toBe('force-dynamic');
    expect(runtime).toBe('nodejs');
  });

  it('returns a generic 503 and logs no database details', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.execute.mockRejectedValueOnce(new Error('postgresql://user:password@private-host/db'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    const line = String(errorLog.mock.calls[0]?.[0]);
    expect(line).toContain('readiness_check_failed');
    expect(line).not.toContain('private-host');
    expect(line).not.toContain('password');
  });
});

