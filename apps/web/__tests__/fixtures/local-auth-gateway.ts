import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

/** Test infrastructure only. Import/factory construction never starts networking. */
export const GATEWAY_LIMITS = Object.freeze({
  requestBytes: 64 * 1024, responseBytes: 1024 * 1024, headerBytes: 32 * 1024,
  requests: 16, rejectionDeliveries: 16, samples: 1024, normalMs: 10_000, barrierMs: 30_000, controlledMs: 40_000, deliveryMs: 500,
});
const ORIGIN = 'http://127.0.0.1:3000';
export type Headers = ReadonlyArray<readonly [string, string]>;
export type Category = 'user' | 'password' | 'refresh' | 'logout';
export type Phase = 'upstream' | 'response';
type Outcome = 'completed' | 'failed' | 'canceled';
type DeliveryOutcome = 'delivered' | 'failed' | 'canceled';
export interface GatewayRequest {
  method: string; target: string; headers: Headers; body: AsyncIterable<Uint8Array>;
  signal?: AbortSignal;
  cancelBody?: () => void;
}
export interface SafeResponse {
  status: number; headers: Headers; body: Uint8Array; deadlineAt?: number;
  /** Hermetic callers must acknowledge delivery; abandoned ownership expires at deadlineAt. */
  reportDelivery?: (outcome: boolean | 'failed') => void;
  deliverySignal?: AbortSignal;
}
export interface UpstreamRequest {
  hostname: '127.0.0.1'; port: 55431; method: string; path: string;
  headers: Headers; body: Uint8Array; signal: AbortSignal;
}
export interface UpstreamResponse { status: number; headers: Headers; body: AsyncIterable<Uint8Array> }
export interface Transport { send(request: UpstreamRequest): Promise<UpstreamResponse> }
export interface Listener {
  listen(host: '127.0.0.1', port: 55430): Promise<void>;
  close(): Promise<void>;
}
export interface Clock { now(): number; schedule(callback: () => void, ms: number): () => void }
export interface ResponseSink {
  writable(): boolean; committed(): boolean;
  write(response: SafeResponse): void; terminate(): void;
  on(event: 'finish' | 'error' | 'close', callback: () => void): () => void;
}
export interface GatewayConfiguration {
  transport?: Transport; clock?: Clock;
  listenerFactory?: (handle: (request: GatewayRequest) => Promise<SafeResponse>) => Listener;
}
export interface Sample {
  category: Category | 'preflight' | 'rejected'; status: number; durationMs: number; outcome: Outcome;
  /** Delivery is distinct from an HTTP/provider failure (e.g. a delivered 503). */
  deliveryOutcome: DeliveryOutcome;
}
export interface Counters {
  accepted: number; upstreamAttempts: number; completed: number; failed: number; canceled: number;
  preflights: number; rejected: number; droppedSamples: number;
  routes: Record<Category, number>; samples: ReadonlyArray<Readonly<Sample>>;
  deliveries: Record<DeliveryOutcome, number>;
}
export interface HeldRequest { id: string; category: Category; phase: Phase }
export interface BarrierControls {
  enable(): void; disable(): void;
  arm(category: Category, phase: Phase, count?: number): void;
  waitForHeld(category: Category, phase: Phase, excludeIds?: readonly string[]): Promise<Readonly<HeldRequest>>;
  release(id: string): void; releaseInOrder(ids: readonly string[]): void; cancelAll(): void;
}
export interface LocalAuthGateway {
  handle(request: GatewayRequest): Promise<SafeResponse>;
  start(): Promise<void>; close(): Promise<void>;
  snapshotCounters(): Readonly<Counters>; resetCounters(): void; controls: BarrierControls;
}

class GatewayFailure extends Error {
  constructor(readonly status: number, readonly category: string) { super(category); }
}
const fail = (status: number, category: string): never => { throw new GatewayFailure(status, category); };
const requestHeaders = new Set(['authorization', 'apikey', 'content-type', 'accept', 'x-client-info', 'x-supabase-api-version', 'cookie']);
const corsHeaders = new Set(['authorization', 'apikey', 'content-type', 'x-client-info', 'x-supabase-api-version']);
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const routes: ReadonlyArray<{ target: string; category: Category; method: string; path: string }> = [
  { target: '/auth/v1/token?grant_type=password', category: 'password', method: 'POST', path: '/token?grant_type=password' },
  { target: '/auth/v1/token?grant_type=refresh_token', category: 'refresh', method: 'POST', path: '/token?grant_type=refresh_token' },
  { target: '/auth/v1/user', category: 'user', method: 'GET', path: '/user' },
  { target: '/auth/v1/logout?scope=local', category: 'logout', method: 'POST', path: '/logout?scope=local' },
];

function validateTarget(target: string) {
  if (!/^\/[A-Za-z0-9_/?=&-]+$/.test(target) || target.includes('//') || target.split('?')[0].endsWith('/')) fail(400, 'invalid_target');
  const route = routes.find((entry) => entry.target === target);
  if (route) return route;
  const path = target.split('?')[0];
  if (['/auth/v1/token', '/auth/v1/user', '/auth/v1/logout'].includes(path)) fail(400, 'invalid_query');
  return fail(404, 'route_denied');
}

function validateHeaders(headers: Headers, upstream = false): Map<string, string[]> {
  const status = upstream ? 502 : 400;
  let bytes = 2;
  const map = new Map<string, string[]>();
  for (const [name, value] of headers) {
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (bytes > GATEWAY_LIMITS.headerBytes) fail(upstream ? 502 : 431, 'headers_too_large');
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) fail(status, 'invalid_headers');
    const key = name.toLowerCase();
    const values = map.get(key) ?? [];
    values.push(value); map.set(key, values);
  }
  for (const [key, values] of map) {
    if (values.length > 1 && key !== 'set-cookie') fail(status, 'duplicate_headers');
    if (!upstream && key === 'set-cookie') fail(status, 'invalid_headers');
  }
  const nominations = (map.get('connection')?.[0] ?? '').toLowerCase().split(',').map((value) => value.trim());
  if (nominations.some((key) => requestHeaders.has(key) || ['set-cookie', 'content-length', 'content-type'].includes(key))) fail(status, 'protected_header_nominated');
  if (map.has('content-length') && map.has('transfer-encoding')) fail(status, 'ambiguous_framing');
  if (map.has('transfer-encoding') && map.get('transfer-encoding')?.[0].toLowerCase() !== 'chunked') fail(status, 'invalid_framing');
  return map;
}
function declaredLength(headers: Map<string, string[]>, max: number, status: number): number | undefined {
  const raw = headers.get('content-length')?.[0];
  if (raw === undefined) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) fail(status === 413 ? 400 : status, 'invalid_length');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) fail(status, 'body_too_large');
  return value;
}
async function collect(body: AsyncIterable<Uint8Array>, max: number, expected: number | undefined, status: number, signal: AbortSignal) {
  const buffer = Buffer.alloc(max);
  let size = 0;
  for await (const chunk of body) {
    if (signal.aborted) fail(504, 'operation_aborted');
    if (!(chunk instanceof Uint8Array)) fail(status === 413 ? 400 : 502, 'invalid_body');
    size += chunk.byteLength;
    if (size > max) fail(status, 'body_too_large');
    buffer.set(chunk, size - chunk.byteLength);
  }
  if (expected !== undefined && size !== expected) fail(status === 413 ? 400 : 502, 'incomplete_body');
  // Do not retain the full capacity for a small returned body.
  return Buffer.from(buffer.subarray(0, size));
}
function responseHeaders(headers: Headers): Headers {
  const map = validateHeaders(headers, true);
  const nominated = new Set((map.get('connection')?.[0] ?? '').toLowerCase().split(',').map((item) => item.trim()));
  return headers.filter(([name]) => {
    const key = name.toLowerCase();
    return !hopHeaders.has(key) && !nominated.has(key) && key !== 'content-length' && key !== 'forwarded' && !key.startsWith('x-forwarded-') && !key.startsWith('access-control-');
  });
}
function errorResponse(status: number, category: string): SafeResponse {
  return { status, headers: [['content-type', 'application/json'], ['cache-control', 'no-store'], ['vary', 'Origin']], body: Buffer.from(JSON.stringify({ error: category })) };
}
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort', aborted); action();
    };
    const aborted = () => finish(() => reject(new GatewayFailure(504, 'operation_aborted')));
    // Attach both settlement handlers even for an already-aborted signal.
    // Late rejection is observed, but cannot replace the first terminal event.
    work.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)));
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
}
/** Shared by the real listener and fake sinks; never opens sockets. */
export function deliverLocalAuthResponse(result: SafeResponse, sink: ResponseSink, clock: Clock): void {
  let finished = false;
  const cleanups: Array<() => void> = [];
  const finish = (outcome: boolean | 'failed', terminate = false) => {
    if (finished) return; finished = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
    result.reportDelivery?.(outcome);
    if (terminate) sink.terminate();
  };
  const aborted = () => finish(true, true);
  if (!sink.writable() || sink.committed() || result.deliverySignal?.aborted) { finish(true, true); return; }
  const remaining = (result.deadlineAt ?? clock.now() + GATEWAY_LIMITS.normalMs) - clock.now();
  if (remaining <= 0) { finish('failed', true); return; }
  cleanups.push(sink.on('finish', () => finish(false)), sink.on('error', () => finish('failed', true)), sink.on('close', () => finish(true)));
  cleanups.push(clock.schedule(() => finish('failed', true), remaining));
  result.deliverySignal?.addEventListener('abort', aborted, { once: true });
  cleanups.push(() => result.deliverySignal?.removeEventListener('abort', aborted));
  try { sink.write(result); } catch { finish('failed', true); }
}
function rawHeaders(message: IncomingMessage): Headers {
  const result: Array<[string, string]> = [];
  for (let i = 0; i < message.rawHeaders.length; i += 2) result.push([message.rawHeaders[i], message.rawHeaders[i + 1]]);
  return result;
}
async function* incomingBody(message: IncomingMessage, status = 502) {
  for await (const chunk of message) {
    if (!(chunk instanceof Uint8Array)) fail(status, 'invalid_body');
    yield chunk;
  }
  if (!message.complete) fail(status, 'incomplete_body');
}
const nodeTransport: Transport = {
  send(input) {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      for (const [name, value] of input.headers) headers[name] = value;
      const request = httpRequest({ protocol: 'http:', hostname: '127.0.0.1', port: 55431,
        method: input.method, path: input.path, headers, signal: input.signal,
        agent: false, maxHeaderSize: GATEWAY_LIMITS.headerBytes }, (response) => {
        resolve({ status: response.statusCode ?? 502, headers: rawHeaders(response), body: incomingBody(response) });
      });
      request.once('error', reject);
      request.end(input.body);
    });
  },
};
function nodeListener(handle: (request: GatewayRequest) => Promise<SafeResponse>, clock: Clock): Listener {
  const sockets = new Set<Socket>();
  let rejectListen: ((error: Error) => void) | undefined;
  const server = createServer({ maxHeaderSize: GATEWAY_LIMITS.headerBytes }, (request, response) => {
    const controller = new AbortController();
    let discardInput = false;
    const disconnected = () => { if (!response.writableFinished) { controller.abort(); request.destroy(); } };
    response.once('close', disconnected);
    request.once('aborted', disconnected);
    void handle({ method: request.method ?? '', target: request.url ?? '', headers: rawHeaders(request),
      body: incomingBody(request, 400), signal: controller.signal, cancelBody: () => { discardInput = true; } }).then((result) => {
      if (controller.signal.aborted || response.destroyed) { result.reportDelivery?.(true); request.destroy(); return; }
      deliverLocalAuthResponse(result, {
        writable: () => !response.destroyed && response.writable && !controller.signal.aborted,
        committed: () => response.headersSent,
        on: (event, callback) => { response.once(event, callback); return () => { response.removeListener(event, callback); }; },
        terminate: () => { request.destroy(); response.destroy(); },
        write: (output) => {
          const headers: Record<string, string | string[]> = {};
          for (const [name, value] of output.headers) {
            const key = name.toLowerCase();
            if (key === 'set-cookie') {
              const old = headers[key]; headers[key] = [...(Array.isArray(old) ? old : old ? [old] : []), value];
            } else headers[key] = value;
          }
          if (discardInput) { headers.connection = 'close'; response.once('finish', () => request.destroy()); }
          response.writeHead(output.status, headers); response.end(output.body);
        },
      }, clock);
    }).catch(() => { request.destroy(); response.destroy(); }).finally(() => request.removeListener('aborted', disconnected));
  });
  server.maxConnections = GATEWAY_LIMITS.requests;
  server.headersTimeout = GATEWAY_LIMITS.normalMs;
  server.requestTimeout = GATEWAY_LIMITS.controlledMs;
  server.keepAliveTimeout = 1_000;
  server.setTimeout(GATEWAY_LIMITS.controlledMs, (socket) => socket.destroy());
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (error, socket) => {
    const status = 'code' in error && error.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400;
    if (socket.writable) socket.end(`HTTP/1.1 ${status} Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    else socket.destroy();
  });
  server.on('error', () => { for (const socket of sockets) socket.destroy(); });
  return {
    listen: () => new Promise<void>((resolve, reject) => {
      rejectListen = reject;
      const error = () => { rejectListen = undefined; reject(new Error('gateway_start_failed')); };
      server.once('error', error);
      server.listen(55430, '127.0.0.1', () => { rejectListen = undefined; server.removeListener('error', error); resolve(); });
    }),
    close: () => new Promise<void>((resolve, reject) => {
      rejectListen?.(new Error('gateway_start_canceled')); rejectListen = undefined;
      for (const socket of sockets) socket.destroy();
      const clean = () => { server.removeAllListeners(); sockets.clear(); };
      if (!server.listening) { clean(); resolve(); return; }
      server.close((error) => { clean(); if (error) reject(new Error('gateway_close_failed')); else resolve(); });
    }),
  };
}

/** Dependencies are trusted test adapters; no caller-configurable network destinations. */
export function createLocalAuthGateway(configuration: GatewayConfiguration = {}): LocalAuthGateway {
  const transport = configuration.transport ?? nodeTransport;
  const clock = configuration.clock ?? { now: () => performance.now(), schedule: (callback: () => void, ms: number) => {
    const timer = setTimeout(callback, ms); return () => clearTimeout(timer);
  } };
  const fresh = (): Counters => ({ accepted: 0, upstreamAttempts: 0, completed: 0, failed: 0, canceled: 0,
    preflights: 0, rejected: 0, droppedSamples: 0, routes: { user: 0, password: 0, refresh: 0, logout: 0 },
    deliveries: { delivered: 0, failed: 0, canceled: 0 }, samples: [] });
  let counters = fresh();
  const samples: Sample[] = [];
  let closing = false;
  let enabled = false;
  let sequence = 0;
  let listener: Listener | undefined;
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const active = new Set<AbortController>();
  const finalizers = new Map<AbortController, () => void>();
  const controlled = new Set<AbortController>();
  const rejectionFinalizers = new Set<(outcome: boolean | 'failed') => void>();
  type Arm = { category: Category; phase: Phase; count: number; cancelTimer: () => void };
  const arms: Arm[] = [];
  const held = new Map<string, { info: HeldRequest; release: () => void; controller: AbortController }>();
  const waiters = new Set<{ category: Category; phase: Phase; excludeIds: readonly string[]; resolve: (info: Readonly<HeldRequest>) => void; reject: (error: Error) => void; cancelTimer: () => void }>();
  const record = (category: Sample['category'], status: number, outcome: Outcome, began: number,
    deliveryOutcome: DeliveryOutcome = outcome === 'completed' ? 'delivered' : outcome) => {
    counters[outcome]++;
    counters.deliveries[deliveryOutcome]++;
    if (samples.length < GATEWAY_LIMITS.samples) {
      const sample = { category, status, outcome, deliveryOutcome, durationMs: Math.max(0, clock.now() - began) };
      samples.push(sample); return sample;
    }
    counters.droppedSamples++;
  };
  const ownRejectedResponse = (input: GatewayRequest, result: SafeResponse, began: number): SafeResponse => {
    counters.rejected++;
    const signal = new AbortController();
    const deadlineAt = began + GATEWAY_LIMITS.deliveryMs;
    if (rejectionFinalizers.size >= GATEWAY_LIMITS.rejectionDeliveries) {
      record('rejected', result.status, 'failed', began, 'failed'); signal.abort();
      return { ...result, deadlineAt, deliverySignal: signal.signal };
    }
    let finalized = false;
    let cancelTimer: () => void = () => undefined;
    const canceled = () => finish(true);
    const finish = (outcome: boolean | 'failed') => {
      if (finalized) return; finalized = true;
      cancelTimer(); input.signal?.removeEventListener('abort', canceled); rejectionFinalizers.delete(finish);
      record('rejected', result.status, outcome === true ? 'canceled' : 'failed', began,
        outcome === false ? 'delivered' : outcome === true ? 'canceled' : 'failed');
      signal.abort();
    };
    rejectionFinalizers.add(finish);
    cancelTimer = clock.schedule(() => finish('failed'), Math.max(0, deadlineAt - clock.now()));
    input.signal?.addEventListener('abort', canceled, { once: true });
    if (input.signal?.aborted) canceled();
    return { ...result, deadlineAt, deliverySignal: signal.signal, reportDelivery: finish };
  };
  const cancelAll = () => {
    for (const arm of arms.splice(0)) arm.cancelTimer();
    for (const controller of controlled) controller.abort(new GatewayFailure(504, 'barrier_canceled'));
    for (const entry of held.values()) entry.controller.abort(new GatewayFailure(504, 'barrier_canceled'));
    for (const waiter of waiters) { waiter.cancelTimer(); waiter.reject(new Error('barrier_canceled')); }
    waiters.clear();
  };
  const reserve = (category: Category): Phase[] => {
    const phases: Phase[] = [];
    for (const phase of ['upstream', 'response'] satisfies Phase[]) {
      const arm = arms.find((entry) => entry.category === category && entry.phase === phase);
      if (arm) {
        phases.push(phase); arm.count--;
        if (!arm.count) { arm.cancelTimer(); arms.splice(arms.indexOf(arm), 1); }
      }
    }
    return phases;
  };
  const hold = (category: Category, phase: Phase, controller: AbortController) => new Promise<void>((resolve, reject) => {
    const id = `request-${++sequence}`;
    const info = { id, category, phase };
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return; finished = true; cancelTimer(); held.delete(id);
      controller.signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const aborted = () => finish(new GatewayFailure(504, 'barrier_canceled'));
    const cancelTimer = clock.schedule(() => { finish(new GatewayFailure(504, 'barrier_timeout')); controller.abort(new GatewayFailure(504, 'barrier_timeout')); }, GATEWAY_LIMITS.barrierMs);
    held.set(id, { info, release: () => finish(), controller });
    controller.signal.addEventListener('abort', aborted, { once: true });
    if (controller.signal.aborted) { aborted(); return; }
    for (const waiter of waiters) if (waiter.category === category && waiter.phase === phase && !waiter.excludeIds.includes(id)) {
      waiter.cancelTimer(); waiters.delete(waiter); waiter.resolve(Object.freeze({ ...info })); break;
    }
  });
  const controls: BarrierControls = {
    enable() { if (closing) throw new Error('gateway_closed'); enabled = true; },
    disable() { enabled = false; cancelAll(); },
    arm(category, phase, count = 1) {
      if (!enabled || closing || !['user', 'password', 'refresh', 'logout'].includes(category) || !['upstream', 'response'].includes(phase)) throw new Error('barrier_denied');
      if (!Number.isInteger(count) || count < 1 || arms.reduce((sum, entry) => sum + entry.count, 0) + count > 16) throw new Error('barrier_capacity');
      const entry: Arm = { category, phase, count, cancelTimer: () => undefined };
      entry.cancelTimer = clock.schedule(() => { const index = arms.indexOf(entry); if (index >= 0) arms.splice(index, 1); }, GATEWAY_LIMITS.barrierMs);
      arms.push(entry);
    },
    waitForHeld(category, phase, excludeIds = []) {
      if (!enabled || closing || waiters.size >= 16 || excludeIds.length > 16 ||
        !['user', 'password', 'refresh', 'logout'].includes(category) || !['upstream', 'response'].includes(phase) ||
        excludeIds.some((id) => !/^request-[1-9][0-9]{0,15}$/.test(id))) return Promise.reject(new Error('barrier_denied'));
      const existing = [...held.values()].find((entry) => entry.info.category === category && entry.info.phase === phase && !excludeIds.includes(entry.info.id));
      if (existing) return Promise.resolve(Object.freeze({ ...existing.info }));
      return new Promise<Readonly<HeldRequest>>((resolve, reject) => {
        const waiter: { category: Category; phase: Phase; excludeIds: readonly string[]; resolve: (info: Readonly<HeldRequest>) => void; reject: (error: Error) => void; cancelTimer: () => void } = { category, phase, excludeIds: [...excludeIds], resolve, reject, cancelTimer: () => undefined };
        waiter.cancelTimer = clock.schedule(() => { waiters.delete(waiter); reject(new Error('barrier_wait_timeout')); }, GATEWAY_LIMITS.barrierMs);
        waiters.add(waiter);
      });
    },
    release(id) { const entry = held.get(id); if (!entry) throw new Error('barrier_not_found'); entry.release(); },
    releaseInOrder(ids) {
      if (ids.length > 16 || new Set(ids).size !== ids.length || ids.some((id) => !held.has(id))) throw new Error('barrier_not_found');
      for (const id of ids) held.get(id)?.release();
    },
    cancelAll,
  };
  const handle = async (input: GatewayRequest): Promise<SafeResponse> => {
    const began = clock.now();
    let deadlineAt = began + GATEWAY_LIMITS.normalMs;
    let category: Sample['category'] = 'rejected';
    let controller: AbortController | undefined;
    const delivery = new AbortController();
    let cancelOperation: () => void = () => undefined;
    let cancelDeadline: () => void = () => undefined;
    let canceled = false;
    let finalized = false;
    let stage: 'request' | 'upstream' = 'request';
    let browser = false;
    const finalize = (outcome: Outcome, status: number, deliveryOutcome?: DeliveryOutcome) => {
      if (finalized) return; finalized = true;
      cancelOperation(); cancelDeadline();
      input.signal?.removeEventListener('abort', disconnect);
      if (controller) {
        controller.abort(); active.delete(controller); controlled.delete(controller); finalizers.delete(controller);
      }
      if (category === 'rejected') counters.rejected++;
      record(category, status, outcome, began, deliveryOutcome);
      delivery.abort();
    };
    const disconnect = () => {
      canceled = true; controller?.abort(); finalize('canceled', 0);
    };
    const ownResponse = (result: SafeResponse): SafeResponse => ({
      ...result, deadlineAt, deliverySignal: delivery.signal,
      reportDelivery(outcome) {
        finalize(outcome === true ? 'canceled' : outcome === 'failed' || result.status >= 400 ? 'failed' : 'completed',
          outcome === false ? result.status : 0, outcome === false ? 'delivered' : outcome === true ? 'canceled' : 'failed');
      },
    });
    const budget = (total: number) => {
      cancelOperation(); cancelDeadline();
      deadlineAt = began + total;
      cancelOperation = clock.schedule(() => controller?.abort(new GatewayFailure(504, 'operation_timeout')),
        Math.max(0, deadlineAt - GATEWAY_LIMITS.deliveryMs - clock.now()));
      cancelDeadline = clock.schedule(() => {
        controller?.abort(new GatewayFailure(504, 'delivery_timeout')); finalize('failed', 0);
      }, Math.max(0, deadlineAt - clock.now()));
    };
    try {
      if (closing || active.size >= GATEWAY_LIMITS.requests) fail(503, 'gateway_unavailable');
      controller = new AbortController(); active.add(controller);
      finalizers.set(controller, () => finalize('canceled', 0));
      input.signal?.addEventListener('abort', disconnect, { once: true });
      budget(GATEWAY_LIMITS.normalMs);
      if (input.signal?.aborted) { disconnect(); fail(503, 'client_canceled'); }
      const route = validateTarget(input.target);
      const headers = validateHeaders(input.headers);
      const origin = headers.get('origin')?.[0];
      if (origin !== undefined && origin !== ORIGIN) fail(403, 'origin_denied');
      browser = origin === ORIGIN;
      const expected = declaredLength(headers, GATEWAY_LIMITS.requestBytes, 413);
      const signal = controller.signal;
      if (input.method === 'OPTIONS') {
        const method = headers.get('access-control-request-method')?.[0];
        const requested = headers.get('access-control-request-headers')?.[0];
        if (!browser || method !== route.method || (requested !== undefined && requested.split(',').some((name) => !corsHeaders.has(name.trim().toLowerCase())))) fail(403, 'preflight_denied');
        if ((expected ?? 0) !== 0 || headers.has('transfer-encoding')) fail(400, 'preflight_body_denied');
        // Inspect the actual iterator: absent/zero length does not prove an empty stream.
        await abortable(collect(input.body, 0, 0, 400, signal), signal);
        counters.preflights++; category = 'preflight';
        return ownResponse({ status: 204, body: Buffer.alloc(0), headers: [['access-control-allow-origin', ORIGIN],
          ['access-control-allow-methods', route.method], ['access-control-allow-headers', [...corsHeaders].join(', ')],
          ['vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers']] });
      }
      if (input.method !== route.method) fail(405, 'method_denied');
      const phases = enabled ? reserve(route.category) : [];
      if (phases.length) { controlled.add(controller); budget(GATEWAY_LIMITS.controlledMs); }
      category = route.category; counters.accepted++; counters.routes[category]++;
      const body = await abortable(collect(input.body, GATEWAY_LIMITS.requestBytes, expected, 413, signal), signal);
      if (input.method === 'GET' && body.byteLength) fail(400, 'unexpected_body');
      if (phases.includes('upstream')) await hold(route.category, 'upstream', controller);
      stage = 'upstream';
      const forwarded: Array<readonly [string, string]> = input.headers.filter(([name]) => requestHeaders.has(name.toLowerCase()));
      forwarded.push(['host', '127.0.0.1:55431'], ['content-length', String(body.byteLength)]);
      validateHeaders(forwarded);
      counters.upstreamAttempts++;
      const upstream = await abortable(transport.send({ hostname: '127.0.0.1', port: 55431, method: route.method,
        path: route.path, headers: forwarded, body, signal }), signal);
      if (!Number.isInteger(upstream.status) || upstream.status < 200 || upstream.status > 599) fail(502, 'invalid_upstream');
      const responseMap = validateHeaders(upstream.headers, true);
      if ((upstream.status >= 300 && upstream.status < 400) || responseMap.has('location')) fail(502, 'redirect_denied');
      const responseLength = declaredLength(responseMap, GATEWAY_LIMITS.responseBytes, 502);
      const responseBody = await abortable(collect(upstream.body, GATEWAY_LIMITS.responseBytes, responseLength, 502, signal), signal);
      if ((upstream.status === 204 || upstream.status === 205) && responseBody.length) fail(502, 'invalid_upstream');
      if (phases.includes('response')) await hold(route.category, 'response', controller);
      if (signal.aborted) fail(504, 'operation_aborted');
      const outputHeaders: Array<readonly [string, string]> = [...responseHeaders(upstream.headers)];
      const varyIndex = outputHeaders.findIndex(([name]) => name.toLowerCase() === 'vary');
      const oldVary = varyIndex >= 0 ? outputHeaders.splice(varyIndex, 1)[0][1] : '';
      outputHeaders.push(['vary', oldVary ? oldVary + ', Origin' : 'Origin']);
      if (browser) outputHeaders.push(['access-control-allow-origin', ORIGIN]);
      if (upstream.status !== 204) outputHeaders.push(['content-length', String(responseBody.length)]);
      validateHeaders(outputHeaders, true);
      return ownResponse({ status: upstream.status, headers: outputHeaders, body: responseBody });
    } catch (error) {
      try { input.cancelBody?.(); } catch { error = new GatewayFailure(503, 'body_cleanup_failed'); }
      const abortReason: unknown = controller?.signal.reason;
      const failure = controller?.signal.aborted && abortReason instanceof GatewayFailure ? abortReason : error;
      const status = canceled ? 503 : failure instanceof GatewayFailure ? failure.status : controller?.signal.aborted ? 504 : stage === 'request' ? 400 : 502;
      const reason = canceled ? 'client_canceled' : failure instanceof GatewayFailure ? failure.category : controller?.signal.aborted ? 'operation_timeout' : stage === 'request' ? 'invalid_request' : 'upstream_failed';
      const result = errorResponse(status, reason);
      if (!controller) return ownRejectedResponse(input, result, began);
      return ownResponse(browser ? { ...result, headers: [...result.headers, ['access-control-allow-origin', ORIGIN]] } : result);
    } finally {
      // Retain capacity, hard deadline and downstream ownership until acknowledgement.
      cancelOperation(); controller?.abort();
    }
  };
  const lifecycle = async (work: Promise<void>) => {
    const controller = new AbortController();
    const cancel = clock.schedule(() => controller.abort(), GATEWAY_LIMITS.normalMs);
    try { await abortable(work, controller.signal); } finally { cancel(); }
  };
  const stopOwned = (): Promise<void> => {
    for (const finish of [...rejectionFinalizers]) finish(true);
    if (stopping) return stopping;
    closing = true; enabled = false;
    for (const controller of active) controller.abort(new GatewayFailure(503, 'gateway_shutdown'));
    cancelAll();
    for (const finalize of [...finalizers.values()]) finalize();
    stopping = (async () => {
      try { if (listener) await lifecycle(listener.close()); } catch { throw new Error('gateway_close_failed'); }
    })();
    return stopping;
  };
  return {
    handle, controls,
    snapshotCounters() { return Object.freeze({ ...counters, routes: Object.freeze({ ...counters.routes }),
      deliveries: Object.freeze({ ...counters.deliveries }),
      samples: Object.freeze(samples.map((sample) => Object.freeze({ ...sample }))) }); },
    resetCounters() { if (active.size || rejectionFinalizers.size) throw new Error('requests_active'); counters = fresh(); samples.length = 0; },
    start() {
      if (closing) return Promise.reject(new Error('gateway_closed'));
      if (starting) return starting;
      starting = (async () => {
        try {
          listener = configuration.listenerFactory ? configuration.listenerFactory(handle) : nodeListener(handle, clock);
          await lifecycle(listener.listen('127.0.0.1', 55430));
          if (closing) { await lifecycle(listener.close()); throw new Error('gateway_closed'); }
        } catch {
          try { await stopOwned(); } catch { throw new Error('gateway_start_cleanup_failed'); }
          throw new Error('gateway_start_failed');
        }
      })();
      return starting;
    },
    close: stopOwned,
  };
}
