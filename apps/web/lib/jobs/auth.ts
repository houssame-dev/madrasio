import { createHash, timingSafeEqual } from 'node:crypto';

export type JobAuthorization = 'AUTHORIZED' | 'UNAUTHORIZED' | 'NOT_CONFIGURED';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Machine-only bearer authentication. Browser cookies and School roles are ignored. */
export function authorizeInternalJob(request: Request): JobAuthorization {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 32) return 'NOT_CONFIGURED';

  const match = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/);
  if (!match) return 'UNAUTHORIZED';
  return timingSafeEqual(digest(match[1]), digest(expected)) ? 'AUTHORIZED' : 'UNAUTHORIZED';
}
