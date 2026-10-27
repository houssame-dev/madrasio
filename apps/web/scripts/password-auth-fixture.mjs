/* Loopback-only Auth responses for UI verification. Never proxies upstream. */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const fixtureOrigin = 'http://127.0.0.1:55441';
export const fixtureUser = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
export function fixtureCookie(state = 'valid') {
  const now = Math.floor(Date.now() / 1000);
  const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  const access = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: fixtureUser.id, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, fixture_state: state })}.local-only-signature`;
  const session = {
    access_token: access,
    refresh_token: 'local-only-inert-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: fixtureUser,
  };
  return {
    name: 'sb-127-auth-token',
    value: `base64-${encode(session)}`,
    url: 'http://127.0.0.1:3000',
  };
}
export function startFixture() {
  const counts = { verified: 0, denied: 0, mutationsBlocked: 0 };
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (request.url === '/__fixture/stats') {
      response.end(JSON.stringify(counts));
      return;
    }
    if (request.method === 'GET' && request.url === '/auth/v1/user') {
      let valid = false;
      try {
        const payload = JSON.parse(
          Buffer.from((request.headers.authorization ?? '').split('.')[1], 'base64url').toString(),
        );
        valid = payload.fixture_state === 'valid';
      } catch {
        /* Invalid fixture authorization is denied. */
      }
      counts[valid ? 'verified' : 'denied']++;
      response
        .writeHead(valid ? 200 : 401)
        .end(
          JSON.stringify(
            valid ? fixtureUser : { code: 'bad_jwt', message: 'Local fixture session rejected' },
          ),
        );
      return;
    }
    // Drain without reading, retaining or logging any mutation body.
    request.resume();
    if (request.method !== 'GET') counts.mutationsBlocked++;
    response
      .writeHead(503)
      .end(
        JSON.stringify({
          code: 'fixture_blocked',
          message: 'Local fixture does not perform Auth mutations',
        }),
      );
  });
  return new Promise((resolve) => server.listen(55441, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startFixture();
  console.info('Loopback Auth fixture ready; no upstream transport exists.');
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}
