import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthenticatedError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  recover: vi.fn(),
  context: vi.fn(),
  log: vi.fn(),
  db: {},
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/admin', () => ({ getAuthAdmin: () => ({}) }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: mocks.context }));
vi.mock('@/lib/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://app.example.test' }),
}));
vi.mock('@/lib/auth/recovery', async (original) => ({
  ...(await original<object>()),
  getRecoveryDelivery: () => ({ request: mocks.request }),
}));
vi.mock('@/lib/modules/user-provisioning/application/recover-account', () => ({
  recoverProfileAccount: mocks.recover,
}));
vi.mock('@/lib/observability/logger', async (original) => ({
  ...(await original<object>()),
  logServerEvent: mocks.log,
}));
import { recoveryPOST, profileRecoveryPOST } from '@/lib/api/account-recovery';

const req = (body: unknown) =>
  new Request('https://untrusted.example/api/v1/auth/recovery', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue(undefined);
  mocks.recover.mockResolvedValue({ state: 'REQUESTED' });
  mocks.context.mockResolvedValue({
    userId: 'actor',
    schoolContext: { schoolId: 'current-school' },
  });
});
describe('public recovery non-enumeration', () => {
  it.each(['known', 'unknown', 'inactive', 'rate-limited', 'provider-failure'])(
    'returns identical generic output for %s',
    async (state) => {
      if (state === 'provider-failure' || state === 'rate-limited')
        mocks.request.mockRejectedValue(new Error('private-provider-detail'));
      const response = await recoveryPOST(req({ email: `  ${state.toUpperCase()}@Example.test ` }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { state: 'REQUESTED' } });
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(mocks.request).toHaveBeenCalledWith(
        `${state}@example.test`,
        'https://app.example.test/auth/confirm',
      );
      expect(mocks.request).toHaveBeenCalledOnce();
      expect(mocks.context).not.toHaveBeenCalled();
      expect(JSON.stringify(mocks.log.mock.calls)).not.toMatch(/private-provider-detail|@example/i);
    },
  );
  it.each([
    { email: 'invalid' },
    { email: 'known@example.test', redirectTo: 'https://evil.example' },
  ])('rejects invalid payload without delivery, still generic', async (body) => {
    const response = await recoveryPOST(req(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { state: 'REQUESTED' } });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
describe('admin recovery narrow HTTP boundary', () => {
  it.each(['TEACHER', 'PARENT'] as const)(
    'derives %s and current School on the server',
    async (kind) => {
      const id = randomUUID();
      expect(
        (await profileRecoveryPOST(kind)(req({}), { params: Promise.resolve({ id }) })).status,
      ).toBe(200);
      expect(mocks.recover).toHaveBeenCalledWith(
        expect.objectContaining({ redirectTo: 'https://app.example.test/auth/confirm' }),
        { userId: 'actor', schoolId: 'current-school' },
        kind,
        id,
      );
    },
  );
  it.each(['email', 'userId', 'schoolId', 'role', 'password', 'redirectTo'])(
    'rejects forged %s',
    async (field) => {
      const response = await profileRecoveryPOST('TEACHER')(req({ [field]: 'forged' }), {
        params: Promise.resolve({ id: randomUUID() }),
      });
      expect(response.status).toBe(400);
      expect(mocks.recover).not.toHaveBeenCalled();
    },
  );
  it('denies unauthenticated calls', async () => {
    mocks.context.mockRejectedValue(new UnauthenticatedError());
    expect(
      (
        await profileRecoveryPOST('PARENT')(req({}), {
          params: Promise.resolve({ id: randomUUID() }),
        })
      ).status,
    ).toBe(401);
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});
