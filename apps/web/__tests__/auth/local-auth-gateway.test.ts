// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalAuthGateway, deliverLocalAuthResponse, abortable, GATEWAY_LIMITS,
  type GatewayRequest, type Headers, type Listener, type LocalAuthGateway,
  type SafeResponse, type Transport, type UpstreamResponse, type ResponseSink, type Clock,
} from '../fixtures/local-auth-gateway';

// Neither these tests nor module import can accidentally open an actual socket.
const networking = vi.hoisted(() => ({ createServer: vi.fn(), request: vi.fn() }));
vi.mock('node:http', () => networking);
const USER = '/auth/v1/user';
const REFRESH = '/auth/v1/token?grant_type=refresh_token';
const PASSWORD = '/auth/v1/token?grant_type=password';
const LOGOUT = '/auth/v1/logout?scope=local';
const ORIGIN = 'http://127.0.0.1:3000';
const SENTINEL = 'synthetic-secret-sentinel';
async function* bytes(...chunks: Uint8Array[]) { for (const chunk of chunks) yield chunk; }
function request(target = USER, method = 'GET', headers: Headers = [], body = Buffer.alloc(0), signal?: AbortSignal): GatewayRequest {
  return { target, method, headers, body: bytes(body), signal };
}
function upstream(status = 200, headers: Headers = [], body = Buffer.from('{}')): UpstreamResponse {
  return { status, headers, body: bytes(body) };
}
function header(response: SafeResponse, name: string) {
  return response.headers.filter(([key]) => key.toLowerCase() === name).map(([, value]) => value);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((settle, fail) => { resolve = settle; reject = fail; });
  return { promise, resolve, reject };
}
const gateways: LocalAuthGateway[] = [];
const clock: Clock = { now: () => Date.now(), schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } };
async function deliver(gateway: LocalAuthGateway, input: GatewayRequest): Promise<SafeResponse> {
  const result = await gateway.handle(input); result.reportDelivery?.(false); return result;
}
function setup(send = vi.fn<Transport['send']>().mockImplementation(async () => upstream()), listenerFactory?: (handle: LocalAuthGateway['handle']) => Listener) {
  const gateway = createLocalAuthGateway({ transport: { send }, listenerFactory,
    clock,
  });
  gateways.push(gateway); return { gateway, send };
}
beforeEach(() => { vi.useFakeTimers(); networking.createServer.mockClear(); networking.request.mockClear(); });
async function cleanupTests(owned: Array<{ close(): Promise<void> }>, restore: () => void, inspect: () => void) {
  const failures: Error[] = [];
  try {
    // Attempt every close before waiting. Observe late failures immediately.
    const states = owned.splice(0).map((gateway) => {
      const state = { settled: false };
      try {
        void gateway.close().then(() => { state.settled = true; }, () => {
          state.settled = true; failures.push(new Error('gateway_cleanup_failed'));
        });
      } catch { state.settled = true; failures.push(new Error('gateway_cleanup_failed')); }
      return state;
    });
    await Promise.resolve();
    if (states.some((state) => !state.settled)) {
      if (!vi.isFakeTimers()) failures.push(new Error('gateway_cleanup_requires_fake_clock'));
      else await vi.advanceTimersByTimeAsync(GATEWAY_LIMITS.normalMs);
    }
    await Promise.resolve();
    for (const state of states) if (!state.settled) failures.push(new Error('gateway_cleanup_timeout'));
    try { inspect(); } catch { failures.push(new Error('gateway_cleanup_invariant_failed')); }
    if (failures.length) throw new AggregateError(failures, 'gateway_test_cleanup_failed');
  } finally {
    // Inspection reports orphaned timers before removing them; clearing is not success.
    try { if (vi.isFakeTimers()) vi.clearAllTimers(); } finally { restore(); }
  }
}
afterEach(() => cleanupTests(gateways, () => vi.useRealTimers(), () => {
  expect(vi.getTimerCount()).toBe(0);
  expect(networking.createServer).not.toHaveBeenCalled(); expect(networking.request).not.toHaveBeenCalled();
}));

function fakeSink() {
  const listeners = new Map<string, Set<() => void>>();
  let writable = true; let committed = false;
  const write = vi.fn((_result: SafeResponse) => { committed = true; });
  const terminate = vi.fn(() => { writable = false; });
  const sink: ResponseSink = {
    writable: () => writable, committed: () => committed, write, terminate,
    on(event, callback) {
      const callbacks = listeners.get(event) ?? new Set<() => void>(); callbacks.add(callback); listeners.set(event, callbacks);
      return () => { callbacks.delete(callback); };
    },
  };
  return { sink, write, terminate,
    emit(event: string) { for (const callback of [...(listeners.get(event) ?? [])]) callback(); },
    disconnect() { writable = false; },
    commit() { committed = true; },
    listenerCount() { return [...listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); },
  };
}

describe('local Auth gateway module and lifecycle', () => {
  it('imports and constructs without transport, listener or timer activity', async () => {
    const gatewayModule = await import('../fixtures/local-auth-gateway');
    const factory = vi.fn((): Listener => ({ listen: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }));
    const gateway = gatewayModule.createLocalAuthGateway({ listenerFactory: factory }); gateways.push(gateway);
    expect(factory).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('starts only explicitly at the fixed endpoint and closes idempotently', async () => {
    const listen = vi.fn().mockResolvedValue(undefined); const close = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn(() => ({ listen, close }));
    const { gateway } = setup(undefined, factory);
    expect(factory).not.toHaveBeenCalled();
    await gateway.start(); await gateway.start();
    expect(listen).toHaveBeenCalledTimes(1); expect(listen).toHaveBeenCalledWith('127.0.0.1', 55430);
    await gateway.close(); await gateway.close(); expect(close).toHaveBeenCalledTimes(1);
    expect((await deliver(gateway, request())).status).toBe(503);
    await expect(gateway.start()).rejects.toThrow('gateway_closed');
  });
  it('sanitizes startup rejection and closes only its injected listener', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const { gateway } = setup(undefined, () => ({ listen: vi.fn().mockRejectedValue(new Error(SENTINEL)), close }));
    await expect(gateway.start()).rejects.toThrow('gateway_start_failed'); expect(close).toHaveBeenCalledTimes(1);
  });
  it('bounds a hanging listener startup without sockets', async () => {
    const { gateway } = setup(undefined, () => ({ listen: () => new Promise<void>(() => undefined), close: async () => undefined }));
    const result = gateway.start().catch((error: unknown) => error instanceof Error ? error.message : 'unexpected');
    await vi.advanceTimersByTimeAsync(10_000); expect(await result).toBe('gateway_start_failed');
  });
  it('reports cleanup failure rather than hiding the listener error', async () => {
    const close = vi.fn().mockRejectedValue(new Error(SENTINEL));
    const gateway = createLocalAuthGateway({ listenerFactory: () => ({ listen: async () => undefined, close }) });
    await gateway.start(); await expect(gateway.close()).rejects.toThrow('gateway_close_failed');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('raw target and method allowlist', () => {
  it.each([[USER, 'GET', '/user'], [PASSWORD, 'POST', '/token?grant_type=password'], [REFRESH, 'POST', '/token?grant_type=refresh_token'], [LOGOUT, 'POST', '/logout?scope=local']])(
    'forwards only canonical %s', async (target, method, path) => {
      const { gateway, send } = setup(); expect((await deliver(gateway, request(target, method))).status).toBe(200);
      expect(send.mock.calls[0][0]).toMatchObject({ hostname: '127.0.0.1', port: 55431, method, path });
    },
  );
  it.each(['https://host.invalid/auth/v1/user', '127.0.0.1:55431', '//host/auth/v1/user', '/auth//v1/user', '/auth/v1/user/', '/auth/v1/../user', '/auth/v1/%2e%2e/user', '/auth/v1/%252e%252e/user', '/auth%2fv1/user', '/auth/v1/%ZZ', '/auth/v1/%ff', '/auth\\v1/user', '/auth/v1/user#fragment', '/AUTH/v1/user', '/auth/v1/user?x=1', '/auth/v1/token', `${PASSWORD}&grant_type=password`, `${REFRESH}&x=1`, '/auth/v1/token?grant_type=', '/auth/v1/logout?scope=global', '/auth/v1/admin/users', '/auth/v1/signup', '/auth/v1/recover', '/auth/v1/verify', '/auth/v1/user?'])('rejects noncanonical %s without forwarding', async (target) => {
    const { gateway, send } = setup(); expect((await deliver(gateway, request(target, 'POST'))).status).toBeGreaterThanOrEqual(400); expect(send).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'DELETE', 'HEAD', 'TRACE'])('rejects %s on user', async (method) => {
    const { gateway, send } = setup(); expect((await deliver(gateway, request(USER, method))).status).toBe(405); expect(send).not.toHaveBeenCalled();
  });
});

describe('strict local CORS', () => {
  it.each(['null', 'http://localhost:3000', 'https://other.invalid'])('rejects Origin %s before transport', async (origin) => {
    const { gateway, send } = setup(); expect((await deliver(gateway, request(USER, 'GET', [['origin', origin]]))).status).toBe(403); expect(send).not.toHaveBeenCalled();
  });
  it('serves SDK preflight locally, without credential or wildcard allowance', async () => {
    const { gateway, send } = setup();
    const response = await deliver(gateway, request(PASSWORD, 'OPTIONS', [['origin', ORIGIN], ['access-control-request-method', 'POST'],
      ['access-control-request-headers', 'Authorization, apikey, content-type, x-client-info, x-supabase-api-version']]));
    expect(response.status).toBe(204); expect(send).not.toHaveBeenCalled();
    expect(header(response, 'access-control-allow-origin')).toEqual([ORIGIN]);
    expect(header(response, 'access-control-allow-credentials')).toEqual([]);
    expect(header(response, 'vary')[0]).toContain('Access-Control-Request-Headers');
  });
  it.each([['GET', 'authorization'], ['POST', 'cookie'], ['POST', 'x-custom'], ['POST', '']])('rejects invalid preflight %s / %s', async (method, headers) => {
    const { gateway, send } = setup(); const response = await deliver(gateway, request(PASSWORD, 'OPTIONS', [['origin', ORIGIN], ['access-control-request-method', method], ['access-control-request-headers', headers]]));
    expect(response.status).toBe(403); expect(send).not.toHaveBeenCalled();
  });
  it('requires Origin on preflight and supports server requests without Origin', async () => {
    const { gateway } = setup(); expect((await deliver(gateway, request(USER, 'OPTIONS', [['access-control-request-method', 'GET']]))).status).toBe(403);
    expect((await deliver(gateway, request())).status).toBe(200);
  });
});

describe('headers, bodies and cookies', () => {
  it('forwards SDK/cookie headers and replaces hostile Host/framing metadata', async () => {
    const { gateway, send } = setup();
    const headers: Headers = [['authorization', SENTINEL], ['apikey', SENTINEL], ['cookie', SENTINEL], ['content-type', 'application/json'], ['accept', 'application/json'], ['x-client-info', 'fixture'], ['x-supabase-api-version', '2024-01-01'], ['host', 'host.invalid'], ['forwarded', 'host=host.invalid'], ['x-forwarded-for', 'other'], ['proxy-authorization', SENTINEL], ['x-extra', 'ignored'], ['connection', 'x-extra']];
    await deliver(gateway, request(PASSWORD, 'POST', headers, Buffer.from('{}')));
    const forwarded = send.mock.calls[0][0];
    expect(forwarded.headers).toContainEqual(['authorization', SENTINEL]); expect(forwarded.headers).toContainEqual(['cookie', SENTINEL]);
    expect(forwarded.headers).toContainEqual(['apikey', SENTINEL]); expect(forwarded.headers).toContainEqual(['x-supabase-api-version', '2024-01-01']);
    expect(forwarded.headers).toContainEqual(['host', '127.0.0.1:55431']); expect(forwarded.headers).toContainEqual(['content-length', '2']);
    expect(forwarded.headers.some(([name]) => ['forwarded', 'x-extra', 'connection', 'proxy-authorization', 'x-forwarded-for'].includes(name))).toBe(false);
    expect(Buffer.from(forwarded.body).toString()).toBe('{}');
  });
  it('preserves multiple cookie updates/deletions and reconstructs response safely', async () => {
    const cookies = [`session=${SENTINEL}; Path=/; HttpOnly; Secure; SameSite=Lax`, 'old=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Priority=High'];
    const send = vi.fn<Transport['send']>().mockResolvedValue(upstream(201, [['set-cookie', cookies[0]], ['set-cookie', cookies[1]], ['content-type', 'application/json'], ['transfer-encoding', 'chunked'], ['connection', 'x-extra'], ['x-extra', 'removed'], ['access-control-allow-origin', '*'], ['access-control-allow-credentials', 'true'], ['vary', 'Accept-Encoding']], Buffer.from('{"ok":true}')));
    const { gateway } = setup(send); const response = await deliver(gateway, request(USER, 'GET', [['origin', ORIGIN]]));
    expect(response.status).toBe(201); expect(Buffer.from(response.body).toString()).toBe('{"ok":true}');
    expect(header(response, 'set-cookie')).toEqual(cookies); expect(header(response, 'content-length')).toEqual(['11']);
    expect(header(response, 'transfer-encoding')).toEqual([]); expect(header(response, 'x-extra')).toEqual([]);
    expect(header(response, 'access-control-allow-origin')).toEqual([ORIGIN]); expect(header(response, 'access-control-allow-credentials')).toEqual([]);
    expect(header(response, 'vary')).toEqual(['Accept-Encoding, Origin']); expect(JSON.stringify(gateway.snapshotCounters())).not.toContain(SENTINEL);
  });
  it('preserves a single cookie and ordinary provider error bytes without diagnostics', async () => {
    const { gateway } = setup(vi.fn<Transport['send']>().mockResolvedValue(upstream(401, [['set-cookie', `session=${SENTINEL}`]], Buffer.from(SENTINEL))));
    const result = await deliver(gateway, request()); expect(result.status).toBe(401); expect(header(result, 'set-cookie')).toEqual([`session=${SENTINEL}`]);
    expect(Buffer.from(result.body).toString()).toBe(SENTINEL); expect(JSON.stringify(gateway.snapshotCounters())).not.toContain(SENTINEL);
  });
  const framingCases: Headers[] = [[['content-length', '1'], ['transfer-encoding', 'chunked']], [['content-length', '1'], ['Content-Length', '1']], [['authorization', 'a'], ['Authorization', 'b']], [['cookie', 'a'], ['Cookie', 'b']], [['connection', 'authorization']], [['connection', 'cookie']], [['content-length', '-1']], [['transfer-encoding', 'gzip']], [['origin', ORIGIN], ['Origin', ORIGIN]]];
  it.each(framingCases.map((headers) => ({ headers })))('rejects ambiguous/protected headers $headers', async ({ headers }) => {
    const { gateway, send } = setup(); expect((await deliver(gateway, request(PASSWORD, 'POST', headers))).status).toBe(400); expect(send).not.toHaveBeenCalled();
  });
  it('bounds aggregate request headers', async () => {
    const { gateway, send } = setup(); expect((await deliver(gateway, request(USER, 'GET', [['x-extra', 'x'.repeat(32768)]]))).status).toBe(431); expect(send).not.toHaveBeenCalled();
    expect((await deliver(gateway, request(USER, 'GET', [['x-pad', 'x'.repeat(32757)]]))).status).toBe(200);
  });
});

describe('buffer and framing limits', () => {
  it('accepts exactly 64 KiB and rejects declared/actual over-limit input', async () => {
    const { gateway, send } = setup(); const body = Buffer.alloc(65536);
    expect((await deliver(gateway, request(PASSWORD, 'POST', [['content-length', '65536']], body))).status).toBe(200);
    expect((await deliver(gateway, request(PASSWORD, 'POST', [['content-length', '65537']]))).status).toBe(413);
    expect((await deliver(gateway, request(PASSWORD, 'POST', [], Buffer.alloc(65537)))).status).toBe(413); expect(send).toHaveBeenCalledTimes(1);
  });
  it('enforces chunked bytes, mismatched lengths and incomplete request streams', async () => {
    const { gateway } = setup();
    expect((await deliver(gateway, { ...request(PASSWORD, 'POST', [['transfer-encoding', 'chunked']]), body: bytes(Buffer.alloc(40000), Buffer.alloc(30000)) })).status).toBe(413);
    expect((await deliver(gateway, request(PASSWORD, 'POST', [['content-length', '2']], Buffer.from('a')))).status).toBe(400);
    const broken = async function* () { yield Buffer.from('a'); throw new Error(SENTINEL); };
    expect((await deliver(gateway, { ...request(PASSWORD, 'POST'), body: broken() })).status).toBe(400);
    expect((await deliver(gateway, request(USER, 'GET', [], Buffer.from('a')))).status).toBe(400);
  });
  it('accepts exactly 1 MiB, rejects oversized/mismatched response without cookie leakage', async () => {
    const send = vi.fn<Transport['send']>().mockResolvedValueOnce(upstream(200, [['content-length', '1048576']], Buffer.alloc(1048576)))
      .mockResolvedValueOnce(upstream(200, [['set-cookie', SENTINEL]], Buffer.alloc(1048577)))
      .mockResolvedValueOnce(upstream(200, [['content-length', '1048577']]))
      .mockResolvedValueOnce(upstream(200, [['content-length', '3']], Buffer.from('a')));
    const { gateway } = setup(send); expect((await deliver(gateway, request())).body.length).toBe(1048576);
    for (let i = 0; i < 3; i++) { const response = await deliver(gateway, request()); expect(response.status).toBe(502); expect(header(response, 'set-cookie')).toEqual([]); }
  });
  const responseHeaderCases: Headers[] = [[['x-large', 'x'.repeat(32768)]], [['content-length', '2'], ['transfer-encoding', 'chunked']], [['connection', 'set-cookie']], [['content-type', 'a'], ['Content-Type', 'b']]];
  it.each(responseHeaderCases.map((headers, index) => ({ headers, index })))('rejects unsafe upstream header case $index', async ({ headers }) => {
    const { gateway } = setup(vi.fn<Transport['send']>().mockResolvedValue(upstream(200, headers)));
    expect((await deliver(gateway, request())).status).toBe(502);
  });
  it('rejects premature upstream closure and body-bearing no-content responses', async () => {
    const broken = async function* () { yield Buffer.from('a'); throw new Error(SENTINEL); };
    const send = vi.fn<Transport['send']>().mockResolvedValueOnce({ status: 200, headers: [], body: broken() }).mockResolvedValueOnce(upstream(204));
    const { gateway } = setup(send); expect((await deliver(gateway, request())).status).toBe(502); expect((await deliver(gateway, request())).status).toBe(502);
  });
});

describe('failure and resource safety', () => {
  it('sanitizes refusal and rejects external redirects without exposing cookies', async () => {
    const send = vi.fn<Transport['send']>().mockRejectedValueOnce(new Error(SENTINEL)).mockResolvedValueOnce(upstream(302, [['location', 'https://external.invalid'], ['set-cookie', SENTINEL]]));
    const { gateway } = setup(send);
    for (let i = 0; i < 2; i++) { const result = await deliver(gateway, request()); expect(result.status).toBe(502); expect(Buffer.from(result.body).toString('utf8')).not.toContain(SENTINEL); expect(header(result, 'set-cookie')).toEqual([]); }
  });
  it('bounds upstream timeout and signals cancellation', async () => {
    const pending = deferred<UpstreamResponse>(); const send = vi.fn<Transport['send']>().mockImplementation(() => pending.promise.then(() => upstream()));
    const { gateway } = setup(send); const result = deliver(gateway, request());
    await vi.advanceTimersByTimeAsync(10_000); expect((await result).status).toBe(504);
    expect(send.mock.calls[0][0].signal.aborted).toBe(true); pending.resolve(upstream());
  });
  it('cancels downstream-disconnected work without forwarding secrets into counters', async () => {
    const pending = deferred<UpstreamResponse>(); const send = vi.fn<Transport['send']>().mockImplementation(() => pending.promise.then(() => upstream()));
    const { gateway } = setup(send); const controller = new AbortController(); const result = deliver(gateway, request(USER, 'GET', [], Buffer.alloc(0), controller.signal));
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await result;
    expect(gateway.snapshotCounters().canceled).toBe(1); expect(send.mock.calls[0][0].signal.aborted).toBe(true); pending.resolve(upstream());
  });
  it('rejects the seventeenth concurrent request without an upstream queue', async () => {
    const pending = deferred<UpstreamResponse>(); const send = vi.fn<Transport['send']>().mockImplementation(() => pending.promise.then(() => upstream()));
    const { gateway } = setup(send); const requests = Array.from({ length: 16 }, () => deliver(gateway, request()));
    expect((await deliver(gateway, request())).status).toBe(503); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(16); pending.resolve(upstream()); await Promise.all(requests);
  });
  it('bounds samples, reports drops, freezes independent snapshots and resets', async () => {
    const { gateway } = setup();
    for (let i = 0; i < GATEWAY_LIMITS.samples + 1; i++) await deliver(gateway, request(USER, 'OPTIONS', [['origin', ORIGIN], ['access-control-request-method', 'GET']]));
    const snapshot = gateway.snapshotCounters(); expect(snapshot.samples).toHaveLength(1024); expect(snapshot.droppedSamples).toBe(1);
    expect(snapshot.preflights).toBe(1025); expect(snapshot.upstreamAttempts).toBe(0);
    expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(snapshot.routes)).toBe(true); expect(Object.isFrozen(snapshot.samples[0])).toBe(true);
    gateway.resetCounters(); expect(gateway.snapshotCounters().preflights).toBe(0); expect(snapshot.preflights).toBe(1025);
  });
  it('counts each approved HTTP category and rejection separately', async () => {
    const { gateway } = setup();
    await deliver(gateway, request()); await deliver(gateway, request(PASSWORD, 'POST'));
    await deliver(gateway, request(REFRESH, 'POST')); await deliver(gateway, request(LOGOUT, 'POST'));
    await deliver(gateway, request('/auth/v1/admin/users'));
    const snapshot = gateway.snapshotCounters();
    expect(snapshot.routes).toEqual({ user: 1, password: 1, refresh: 1, logout: 1 });
    expect(snapshot.accepted).toBe(4); expect(snapshot.upstreamAttempts).toBe(4);
    expect(snapshot.completed).toBe(4); expect(snapshot.rejected).toBe(1); expect(snapshot.failed).toBe(1);
  });
  it('records delivery disconnects once without leaking response contents', async () => {
    const { gateway } = setup(); const result = await gateway.handle(request());
    result.reportDelivery?.(true); result.reportDelivery?.(true);
    expect(gateway.snapshotCounters().completed).toBe(0); expect(gateway.snapshotCounters().canceled).toBe(1);
    expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 0, outcome: 'canceled' });
  });
  it('bounds incomplete downstream receipt and requests body cleanup', async () => {
    const blocked = deferred<Uint8Array>(); const cancelBody = vi.fn(); const { gateway, send } = setup();
    const body = async function* () { yield await blocked.promise; };
    const result = deliver(gateway, { ...request(PASSWORD, 'POST'), body: body(), cancelBody });
    await vi.advanceTimersByTimeAsync(10_000); expect((await result).status).toBe(504);
    expect(cancelBody).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled(); blocked.resolve(Buffer.alloc(0));
  });
});

describe('bounded internal barriers', () => {
  it('requires explicit enabling and holds before upstream', async () => {
    const { gateway, send } = setup(); expect(() => gateway.controls.arm('refresh', 'upstream')).toThrow('barrier_denied');
    gateway.controls.enable(); gateway.controls.arm('refresh', 'upstream');
    const waiting = gateway.controls.waitForHeld('refresh', 'upstream'); const result = deliver(gateway, request(REFRESH, 'POST'));
    const held = await waiting; expect(send).not.toHaveBeenCalled(); expect(Object.keys(held).sort()).toEqual(['category', 'id', 'phase']);
    gateway.controls.release(held.id); expect((await result).status).toBe(200); expect(send).toHaveBeenCalledTimes(1);
  });
  it('holds responses and releases requests in selected order', async () => {
    const order: number[] = []; const { gateway } = setup(); gateway.controls.enable(); gateway.controls.arm('refresh', 'response', 2);
    const waiting1 = gateway.controls.waitForHeld('refresh', 'response');
    const first = deliver(gateway, request(REFRESH, 'POST')).then((result) => { order.push(1); return result; }); const held1 = await waiting1;
    const waiting2 = gateway.controls.waitForHeld('refresh', 'response', [held1.id]);
    const second = deliver(gateway, request(REFRESH, 'POST')).then((result) => { order.push(2); return result; });
    const held2 = await waiting2;
    gateway.controls.releaseInOrder([held2.id, held1.id]); await Promise.all([first, second]);
    expect(order).toEqual([2, 1]);
  });
  it('expires barriers and bounded waiters and leaves no timers', async () => {
    const { gateway } = setup(); gateway.controls.enable(); gateway.controls.arm('refresh', 'upstream');
    const held = gateway.controls.waitForHeld('refresh', 'upstream'); const result = deliver(gateway, request(REFRESH, 'POST')); await held;
    await vi.advanceTimersByTimeAsync(30_000); expect((await result).status).toBe(504);
    const missing = gateway.controls.waitForHeld('user', 'response').catch((error: unknown) => error instanceof Error ? error.message : 'unexpected');
    await vi.advanceTimersByTimeAsync(30_000); expect(await missing).toBe('barrier_wait_timeout');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels held requests and waiters on explicit cancellation and shutdown', async () => {
    const { gateway } = setup(); gateway.controls.enable(); gateway.controls.arm('refresh', 'response');
    const held = gateway.controls.waitForHeld('refresh', 'response'); const result = deliver(gateway, request(REFRESH, 'POST')); await held;
    const waiting = gateway.controls.waitForHeld('user', 'upstream').catch((error: unknown) => error instanceof Error ? error.message : 'unexpected');
    gateway.controls.cancelAll(); expect((await result).status).toBe(504); expect(await waiting).toBe('barrier_canceled');
    gateway.controls.arm('user', 'upstream'); const holdUser = gateway.controls.waitForHeld('user', 'upstream'); const next = deliver(gateway, request()); await holdUser;
    await gateway.close(); expect((await next).status).toBe(503); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds arm capacity, cancels on disable and exposes no HTTP controls', async () => {
    const { gateway, send } = setup(); gateway.controls.enable(); gateway.controls.arm('user', 'upstream', 16);
    expect(() => gateway.controls.arm('user', 'upstream')).toThrow('barrier_capacity'); gateway.controls.disable();
    expect((await deliver(gateway, request('/auth/v1/controls', 'POST'))).status).toBe(404); expect(send).not.toHaveBeenCalled();
  });
  it('bounds waiter capacity and cancels all pending waiter timers', async () => {
    const { gateway } = setup(); gateway.controls.enable();
    const waiting = Array.from({ length: 16 }, () => gateway.controls.waitForHeld('user', 'response').catch((error: unknown) => error instanceof Error ? error.message : 'unexpected'));
    await expect(gateway.controls.waitForHeld('user', 'response')).rejects.toThrow('barrier_denied');
    gateway.controls.disable(); expect(await Promise.all(waiting)).toEqual(Array(16).fill('barrier_canceled')); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('R2 bodyless preflight ownership', () => {
  const preflightHeaders: Headers = [['origin', ORIGIN], ['access-control-request-method', 'POST']];
  it.each([
    { extra: [['content-length', '1']], status: 400 },
    { extra: [['content-length', '65537']], status: 413 },
    { extra: [['transfer-encoding', 'chunked']], status: 400 },
    { extra: [['content-length', '0'], ['transfer-encoding', 'chunked']], status: 400 },
    { extra: [['content-length', 'broken']], status: 400 },
  ] satisfies Array<{ extra: Headers; status: number }>)('rejects preflight framing $extra', async ({ extra, status }) => {
    const { gateway, send } = setup(); const cancelBody = vi.fn();
    const result = await deliver(gateway, { ...request(PASSWORD, 'OPTIONS', [...preflightHeaders, ...extra]), cancelBody });
    expect(result.status).toBe(status); expect(cancelBody).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
  });
  it('rejects actual streamed bytes even with zero or absent length', async () => {
    const { gateway, send } = setup();
    for (const headers of [preflightHeaders, [...preflightHeaders, ['content-length', '0'] satisfies readonly [string, string]]]) {
      const cancelBody = vi.fn(); const result = await deliver(gateway, { ...request(PASSWORD, 'OPTIONS', headers, Buffer.from('x')), cancelBody });
      expect(result.status).toBe(400); expect(cancelBody).toHaveBeenCalledTimes(1);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('bounds incomplete preflight and never dispatches it upstream', async () => {
    const { gateway, send } = setup(); const pending = deferred<Uint8Array>(); const cancelBody = vi.fn();
    const body = async function* () { yield await pending.promise; };
    const result = gateway.handle({ ...request(PASSWORD, 'OPTIONS', preflightHeaders), body: body(), cancelBody });
    await vi.advanceTimersByTimeAsync(9500); const response = await result;
    expect(response.status).toBe(504); expect(cancelBody).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
    response.reportDelivery?.(false); pending.resolve(Buffer.alloc(0));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not turn premature preflight closure into a successful 204', async () => {
    const { gateway } = setup(); const cancelBody = vi.fn();
    const body = async function* () { yield* bytes(); throw new Error(SENTINEL); };
    const result = await deliver(gateway, { ...request(PASSWORD, 'OPTIONS', preflightHeaders), body: body(), cancelBody });
    expect(result.status).toBe(400); expect(cancelBody).toHaveBeenCalledTimes(1);
  });
});

describe('R2 terminal delivery and capacity', () => {
  it('delivers a writable sanitized 504 within the unchanged total deadline', async () => {
    const pending = deferred<UpstreamResponse>(); const send = vi.fn<Transport['send']>().mockImplementation(() => pending.promise);
    const { gateway } = setup(send); const result = gateway.handle(request());
    await vi.advanceTimersByTimeAsync(9499); expect(gateway.snapshotCounters().failed).toBe(0);
    await vi.advanceTimersByTimeAsync(1); const response = await result;
    expect(response.status).toBe(504); expect(send.mock.calls[0][0].signal.aborted).toBe(true);
    expect(response.deadlineAt).toBe(clock.now() + 500);
    const fake = fakeSink(); deliverLocalAuthResponse(response, fake.sink, clock);
    expect(fake.write).toHaveBeenCalledTimes(1); expect(fake.write.mock.calls[0][0].status).toBe(504);
    await vi.advanceTimersByTimeAsync(100); fake.emit('finish'); fake.emit('finish');
    expect(gateway.snapshotCounters().failed).toBe(1); expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 504, durationMs: 9600 });
    expect(fake.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0); pending.resolve(upstream());
  });
  it('never writes to closed or already committed sinks', async () => {
    const { gateway } = setup();
    for (const state of ['closed', 'committed']) {
      const response = await gateway.handle(request()); const fake = fakeSink();
      if (state === 'closed') fake.disconnect(); else fake.commit();
      deliverLocalAuthResponse(response, fake.sink, clock);
      expect(fake.write).not.toHaveBeenCalled(); expect(fake.terminate).toHaveBeenCalledTimes(1);
    }
    expect(gateway.snapshotCounters().canceled).toBe(2);
  });
  it('expires undelivered error budget without claiming HTTP 504 delivery', async () => {
    const { gateway } = setup(vi.fn<Transport['send']>().mockImplementation(() => new Promise<UpstreamResponse>(() => undefined)));
    const pending = gateway.handle(request()); await vi.advanceTimersByTimeAsync(9500); const response = await pending;
    const fake = fakeSink(); deliverLocalAuthResponse(response, fake.sink, clock);
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.write).toHaveBeenCalledTimes(1); expect(fake.terminate).toHaveBeenCalledTimes(1);
    expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 0, outcome: 'failed', durationMs: 10000 });
    expect(fake.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('retains sixteen slow delivery slots and releases each exactly once', async () => {
    const { gateway } = setup(); const responses = await Promise.all(Array.from({ length: 16 }, () => gateway.handle(request())));
    const sinks = responses.map((response) => { const fake = fakeSink(); deliverLocalAuthResponse(response, fake.sink, clock); return fake; });
    expect((await deliver(gateway, request())).status).toBe(503);
    await vi.advanceTimersByTimeAsync(200); sinks[0].emit('finish'); sinks[0].emit('finish');
    expect(gateway.snapshotCounters().completed).toBe(1);
    const replacement = await gateway.handle(request()); expect(replacement.status).toBe(200);
    expect((await deliver(gateway, request())).status).toBe(503);
    sinks[1].emit('close'); sinks[2].emit('error');
    const next = await gateway.handle(request()); expect(next.status).toBe(200); next.reportDelivery?.(false);
    replacement.reportDelivery?.(false);
    for (const sink of sinks.slice(3)) sink.emit('finish');
    expect(gateway.snapshotCounters().samples.find((sample) => sample.outcome === 'completed')?.durationMs).toBe(200);
    gateway.resetCounters(); expect(gateway.snapshotCounters().accepted).toBe(0);
    expect(sinks.every((sink) => sink.listenerCount() === 0)).toBe(true);
  });
  it('releases abandoned deliveries at deadline and cancels owned sinks on shutdown', async () => {
    const { gateway } = setup(); const first = await gateway.handle(request());
    await vi.advanceTimersByTimeAsync(10_000); expect(first.deliverySignal?.aborted).toBe(true);
    const next = await gateway.handle(request()); const fake = fakeSink(); deliverLocalAuthResponse(next, fake.sink, clock);
    await gateway.close(); expect(fake.terminate).toHaveBeenCalledTimes(1); expect(fake.listenerCount()).toBe(0);
    expect(gateway.snapshotCounters().samples.map((sample) => sample.outcome)).toEqual(['failed', 'canceled']);
  });
  it('does not extend two controlled holds beyond the forty-second total', async () => {
    const { gateway } = setup(); gateway.controls.enable(); gateway.controls.arm('refresh', 'upstream'); gateway.controls.arm('refresh', 'response');
    const waiting = gateway.controls.waitForHeld('refresh', 'upstream'); const pending = gateway.handle(request(REFRESH, 'POST')); const held = await waiting;
    await vi.advanceTimersByTimeAsync(29_000); const responseWaiting = gateway.controls.waitForHeld('refresh', 'response'); gateway.controls.release(held.id); await responseWaiting;
    await vi.advanceTimersByTimeAsync(10_500); const result = await pending; expect(result.status).toBe(504);
    const fake = fakeSink(); deliverLocalAuthResponse(result, fake.sink, clock); await vi.advanceTimersByTimeAsync(500);
    expect(fake.terminate).toHaveBeenCalledTimes(1); expect(gateway.snapshotCounters().samples[0].durationMs).toBe(40_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('R2 first-terminal cleanup', () => {
  it('startup failure cancels handlers, delivery slots, arms and waiters', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const { gateway } = setup(undefined, () => ({ listen: async () => { throw new Error(SENTINEL); }, close }));
    const response = await gateway.handle(request()); const fake = fakeSink(); deliverLocalAuthResponse(response, fake.sink, clock);
    gateway.controls.enable(); gateway.controls.arm('refresh', 'upstream'); gateway.controls.arm('logout', 'response');
    const held = gateway.controls.waitForHeld('refresh', 'upstream'); const pending = gateway.handle(request(REFRESH, 'POST')); await held;
    const waiter = gateway.controls.waitForHeld('user', 'response').catch((error: unknown) => error instanceof Error ? error.message : 'unexpected');
    await expect(gateway.start()).rejects.toThrow('gateway_start_failed'); expect((await pending).status).toBe(503);
    expect(await waiter).toBe('barrier_canceled'); expect(fake.terminate).toHaveBeenCalledTimes(1);
    await gateway.close(); await gateway.close(); expect(close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['fulfill', 'reject', 'abort', 'already-aborted'])('detaches abort listener on %s without waiting for transport', async (mode) => {
    const controller = new AbortController(); const pending = deferred<string>();
    const add = vi.spyOn(controller.signal, 'addEventListener'); const remove = vi.spyOn(controller.signal, 'removeEventListener');
    if (mode === 'already-aborted') controller.abort();
    const result = abortable(pending.promise, controller.signal).then((value) => value, (error: unknown) => error instanceof Error ? error.message : 'unexpected');
    if (mode === 'fulfill') pending.resolve('ok');
    else if (mode === 'reject') pending.reject(new Error('operation_failed'));
    else if (mode === 'abort') controller.abort();
    expect(await result).toBe(mode === 'fulfill' ? 'ok' : mode === 'reject' ? 'operation_failed' : 'operation_aborted');
    expect(remove).toHaveBeenCalled();
    if (mode === 'already-aborted') expect(add).not.toHaveBeenCalled();
    else expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    pending.resolve('late'); add.mockRestore(); remove.mockRestore();
  });
  it('observes a late rejection after abort without retaining its signal listener', async () => {
    let reject!: (error: Error) => void;
    const work = new Promise<void>((_resolve, fail) => { reject = fail; }); const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = abortable(work, controller.signal).catch((error: unknown) => error instanceof Error ? error.message : 'unexpected');
    controller.abort(); expect(remove).toHaveBeenCalledTimes(1); expect(await result).toBe('operation_aborted');
    reject(new Error(SENTINEL)); await vi.advanceTimersByTimeAsync(0); expect(remove).toHaveBeenCalledTimes(1); remove.mockRestore();
  });
  it('attempts every test cleanup and always restores timers while preserving sanitized failures', async () => {
    const restore = vi.fn(); const inspect = vi.fn();
    const good = vi.fn().mockResolvedValue(undefined); const bad = vi.fn().mockRejectedValue(new Error(SENTINEL));
    const owned = [{ close: bad }, { close: good }, { close: bad }];
    const failure = await cleanupTests(owned, restore, inspect).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('missing_cleanup_error');
    expect(failure.errors).toHaveLength(2); expect(failure.message).not.toContain(SENTINEL);
    expect(good).toHaveBeenCalledTimes(1); expect(bad).toHaveBeenCalledTimes(2); expect(restore).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledTimes(1); expect(owned).toEqual([]);
  });
  it('restores timers when teardown invariant inspection fails', async () => {
    const restore = vi.fn(); await expect(cleanupTests([], restore, () => { throw new Error(SENTINEL); })).rejects.toThrow('gateway_test_cleanup_failed');
    expect(restore).toHaveBeenCalledTimes(1);
  });
  it('calls real timer restoration even when a registered cleanup rejects', async () => {
    const restore = vi.spyOn(vi, 'useRealTimers');
    try {
      await expect(cleanupTests([{ close: async () => { throw new Error(SENTINEL); } }], () => vi.useRealTimers(), () => undefined)).rejects.toThrow('gateway_test_cleanup_failed');
      expect(restore).toHaveBeenCalledTimes(1);
    } finally { restore.mockRestore(); vi.useFakeTimers(); }
  });
});

describe('R2 independent fake responses and diagnostic schemas', () => {
  it('returns fresh body streams across sequential and concurrent HTTP attempts', async () => {
    const { gateway, send } = setup();
    for (let i = 0; i < 2; i++) expect(Buffer.from((await deliver(gateway, request())).body).toString()).toBe('{}');
    const results = await Promise.all(Array.from({ length: 4 }, () => deliver(gateway, request())));
    expect(results.map((result) => Buffer.from(result.body).toString())).toEqual(['{}', '{}', '{}', '{}']); expect(send).toHaveBeenCalledTimes(6);
  });
  it('decodes generated errors and enforces counters containing only permitted diagnostics', async () => {
    const { gateway } = setup(vi.fn<Transport['send']>().mockRejectedValue(new Error(SENTINEL)));
    const result = await deliver(gateway, request(USER, 'GET', [['authorization', SENTINEL], ['cookie', SENTINEL], ['apikey', SENTINEL]]));
    expect(JSON.parse(Buffer.from(result.body).toString('utf8'))).toEqual({ error: 'upstream_failed' });
    expect(result.headers.some(([, value]) => value.includes(SENTINEL))).toBe(false);
    const snapshot = gateway.snapshotCounters(); expect(JSON.stringify(snapshot)).not.toContain(SENTINEL);
    expect(Object.keys(snapshot).sort()).toEqual(['accepted', 'canceled', 'completed', 'deliveries', 'droppedSamples', 'failed', 'preflights', 'rejected', 'routes', 'samples', 'upstreamAttempts']);
    expect(Object.values(snapshot.routes).every((value) => typeof value === 'number')).toBe(true);
    for (const sample of snapshot.samples) {
      expect(Object.keys(sample).sort()).toEqual(['category', 'deliveryOutcome', 'durationMs', 'outcome', 'status']);
      expect(typeof sample.status).toBe('number'); expect(typeof sample.durationMs).toBe('number');
      expect(['completed', 'failed', 'canceled']).toContain(sample.outcome);
      expect(['delivered', 'failed', 'canceled']).toContain(sample.deliveryOutcome);
      expect(['user', 'password', 'refresh', 'logout', 'preflight', 'rejected']).toContain(sample.category);
    }
  });
});

describe('R3A bounded rejection delivery', () => {
  async function saturated() {
    const { gateway } = setup();
    const admitted = await Promise.all(Array.from({ length: 16 }, () => gateway.handle(request())));
    return { gateway, admitted };
  }
  it('records delivered 503 status and duration without consuming an admitted slot', async () => {
    const { gateway, admitted } = await saturated(); const rejected = await gateway.handle(request());
    expect(rejected.status).toBe(503); const sink = fakeSink(); deliverLocalAuthResponse(rejected, sink.sink, clock);
    await vi.advanceTimersByTimeAsync(100); sink.emit('finish'); sink.emit('finish'); rejected.reportDelivery?.(false);
    expect(gateway.snapshotCounters().samples).toEqual([expect.objectContaining({ category: 'rejected', status: 503, deliveryOutcome: 'delivered', durationMs: 100 })]);
    expect(gateway.snapshotCounters().accepted).toBe(16);
    expect(gateway.snapshotCounters().deliveries.delivered).toBe(1);
    expect((await deliver(gateway, request())).status).toBe(503);
    admitted[0].reportDelivery?.(false); expect((await deliver(gateway, request())).status).toBe(200);
    for (const response of admitted.slice(1)) response.reportDelivery?.(false);
  });
  it.each(['close', 'error'])('retains HTTP 503 on rejected sink %s and finalizes once', async (event) => {
    const { gateway } = await saturated(); const result = await gateway.handle(request()); const sink = fakeSink();
    deliverLocalAuthResponse(result, sink.sink, clock); sink.emit(event); result.reportDelivery?.(false);
    const samples = gateway.snapshotCounters().samples;
    expect(samples).toHaveLength(1); expect(samples[0]).toMatchObject({ status: 503, deliveryOutcome: event === 'close' ? 'canceled' : 'failed' });
    expect(sink.listenerCount()).toBe(0);
    const next = await gateway.handle(request()); expect(next.deliverySignal?.aborted).toBe(false); next.reportDelivery?.(false);
  });
  it('bounds expiry and ignores late acknowledgement without releasing unrelated capacity', async () => {
    const { gateway } = await saturated(); const result = await gateway.handle(request()); const sink = fakeSink();
    deliverLocalAuthResponse(result, sink.sink, clock); await vi.advanceTimersByTimeAsync(500);
    expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 503, deliveryOutcome: 'failed', durationMs: 500 });
    const snapshot = gateway.snapshotCounters(); result.reportDelivery?.(false); result.reportDelivery?.(true);
    expect(gateway.snapshotCounters()).toEqual(snapshot); expect(sink.terminate).toHaveBeenCalledTimes(1); expect(sink.listenerCount()).toBe(0);
    expect((await deliver(gateway, request())).status).toBe(503);
  });
  it('cancels rejected ownership on client abort and gateway shutdown', async () => {
    const { gateway } = await saturated(); const abort = new AbortController();
    const first = await gateway.handle(request(USER, 'GET', [], Buffer.alloc(0), abort.signal)); const sink = fakeSink();
    deliverLocalAuthResponse(first, sink.sink, clock); abort.abort();
    expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 503, deliveryOutcome: 'canceled' });
    const second = await gateway.handle(request()); const other = fakeSink(); deliverLocalAuthResponse(second, other.sink, clock);
    await gateway.close(); expect(other.terminate).toHaveBeenCalledTimes(1); expect(sink.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // Shutdown rejections still have a bounded acknowledgement path after close.
    const shutdown = await gateway.handle(request()); expect(shutdown.status).toBe(503); shutdown.reportDelivery?.(false);
    expect(gateway.snapshotCounters().samples.at(-1)).toMatchObject({ status: 503, deliveryOutcome: 'delivered' });
  });
  it('caps rejection ownership at sixteen and fails closed without adding timers', async () => {
    const { gateway } = await saturated(); const pending = await Promise.all(Array.from({ length: GATEWAY_LIMITS.rejectionDeliveries }, () => gateway.handle(request())));
    const timerCount = vi.getTimerCount();
    for (let i = 0; i < 20; i++) {
      const rejected = await gateway.handle(request()); const sink = fakeSink(); deliverLocalAuthResponse(rejected, sink.sink, clock);
      expect(rejected.status).toBe(503); expect(sink.write).not.toHaveBeenCalled(); expect(sink.terminate).toHaveBeenCalledTimes(1);
    }
    expect(vi.getTimerCount()).toBe(timerCount); expect(gateway.snapshotCounters().rejected).toBe(GATEWAY_LIMITS.rejectionDeliveries + 20);
    pending[0].reportDelivery?.(false); const next = await gateway.handle(request()); expect(next.deliverySignal?.aborted).toBe(false);
    next.reportDelivery?.('failed'); for (const response of pending.slice(1)) response.reportDelivery?.(true);
  });
});

describe('R3A deterministic test teardown', () => {
  it('closes all normal fixtures and observes close after explicit fake-time progress', async () => {
    const restored = vi.fn(); const close = vi.fn(() => new Promise<void>((resolve) => { setTimeout(resolve, 100); }));
    const normal = vi.fn().mockResolvedValue(undefined); const owned = [{ close }, { close: normal }];
    await cleanupTests(owned, restored, () => expect(vi.getTimerCount()).toBe(0));
    expect(close).toHaveBeenCalledTimes(1); expect(normal).toHaveBeenCalledTimes(1); expect(restored).toHaveBeenCalledTimes(1); expect(owned).toEqual([]);
  });
  it('progresses a never-settling fake listener close, reports failure and restores real timers', async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const { gateway } = setup(undefined, () => ({ listen: async () => undefined, close }));
    await gateway.start(); // Injected fake listen only; no Node listener exists.
    gateway.controls.enable(); gateway.controls.arm('refresh', 'upstream');
    const normal = vi.fn().mockResolvedValue(undefined); const restored = vi.fn(() => vi.useRealTimers());
    try {
      const failure = await cleanupTests([{ close: () => gateway.close() }, { close: normal }], restored, () => expect(vi.getTimerCount()).toBe(0)).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AggregateError); expect(normal).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
      expect(restored).toHaveBeenCalledTimes(1); expect(vi.isFakeTimers()).toBe(false);
      if (failure instanceof AggregateError) expect(failure.errors.map((error: Error) => error.message)).toEqual(['gateway_cleanup_failed']);
    } finally { vi.useFakeTimers(); const index = gateways.indexOf(gateway); if (index >= 0) gateways.splice(index, 1); }
  });
  it('reports an unresolved raw close rather than treating forced teardown as success', async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined)); const normal = vi.fn().mockResolvedValue(undefined); const restored = vi.fn();
    const failure = await cleanupTests([{ close }, { close: normal }], restored, () => undefined).catch((error: unknown) => error);
    if (!(failure instanceof AggregateError)) throw new Error('missing_cleanup_timeout');
    expect(failure.errors.map((error: Error) => error.message)).toEqual(['gateway_cleanup_timeout']);
    expect(normal).toHaveBeenCalledTimes(1); expect(restored).toHaveBeenCalledTimes(1);
  });
  it('restores timers even if constructing the aggregated error itself fails', async () => {
    const restored = vi.fn();
    vi.stubGlobal('AggregateError', vi.fn(function () { throw new Error('aggregation_failed'); }));
    try {
      await expect(cleanupTests([{ close: async () => { throw new Error(SENTINEL); } }], restored, () => undefined)).rejects.toThrow('aggregation_failed');
      expect(restored).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('R3A deadline boundary regressions', () => {
  it('lets operation timeout win when upstream settlement is scheduled at the same cutoff', async () => {
    const send = vi.fn<Transport['send']>().mockImplementation(() => new Promise((resolve) => { setTimeout(() => resolve(upstream()), 9500); }));
    const { gateway } = setup(send); const pending = gateway.handle(request());
    await vi.advanceTimersByTimeAsync(9500); const result = await pending; expect(result.status).toBe(504);
    result.reportDelivery?.(false); expect(gateway.snapshotCounters().samples[0]).toMatchObject({ status: 504, deliveryOutcome: 'delivered' });
  });
  it('records cancellation if the client closes during sanitized 504 delivery', async () => {
    const { gateway } = setup(vi.fn<Transport['send']>().mockImplementation(() => new Promise<UpstreamResponse>(() => undefined)));
    const pending = gateway.handle(request()); await vi.advanceTimersByTimeAsync(9500); const response = await pending;
    const sink = fakeSink(); deliverLocalAuthResponse(response, sink.sink, clock); sink.emit('close'); response.reportDelivery?.(false);
    expect(gateway.snapshotCounters().samples[0].deliveryOutcome).toBe('canceled'); expect(sink.listenerCount()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});

// Real Node parser/socket behavior, browser CORS, GoTrue compatibility and
// stale-response/logout safety require separately authorized integration proof.
// DESIGN_REVIEW_REQUIRED: barriers are instruments, not an Auth mitigation.
