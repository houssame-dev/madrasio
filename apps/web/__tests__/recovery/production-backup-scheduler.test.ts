// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfigFileTextToJson } from 'typescript';

import worker, {
  EXPECTED_CRON,
  type SchedulerEnv,
} from '../../../../infra/cloudflare/production-backup-scheduler/worker';

// Disposable local signing material only: never persisted or associated with a real GitHub App.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = new Date('2026-09-30T02:23:00.000Z');
function environment(type: 'pkcs1' | 'pkcs8' = 'pkcs1'): SchedulerEnv {
  return {
    GITHUB_APP_ID: '123',
    GITHUB_INSTALLATION_ID: '456',
    GITHUB_OWNER: 'fixture-owner',
    GITHUB_REPOSITORY: 'fixture-repository',
    GITHUB_WORKFLOW: 'backup-production.yml',
    BACKUP_CANDIDATE_SHA: 'a'.repeat(40),
    GITHUB_APP_PRIVATE_KEY: keys.privateKey.export({ type, format: 'pem' }).toString(),
  };
}
function controller() {
  return { cron: EXPECTED_CRON, scheduledTime: now.getTime(), noRetry: vi.fn() };
}
function transport() {
  vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
  const fetcher = vi.fn<typeof fetch>();
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        token: 'synthetic-installation-value',
        expires_at: '2026-09-30T03:23:00Z',
      }),
      { status: 201 },
    ),
  );
  fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('actual workflow shell gates (local processes only)', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/backup-production.yml'),
    'utf8',
  );
  const scripts = [...workflow.matchAll(/        run: \|\r?\n((?:          .*\r?\n|\r?\n)+)/g)].map(
    (match) => match[1].replace(/^          /gm, ''),
  );
  const gate = scripts.find((script) => script.includes('case "$GITHUB_EVENT_NAME"'))!;
  const request = scripts.find((script) => script.includes('MANUAL_CONFIRMATION'))!;

  function execute(script: string, overrides: Record<string, string | undefined>) {
    const directory = mkdtempSync(join(tmpdir(), 'madrasio-scheduler-test-'));
    try {
      const output = join(directory, 'output');
      const bash =
        process.platform === 'win32'
          ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
          : 'bash';
      const result = spawnSync(
        bash,
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
        {
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            NODE_ENV: 'test',
            PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
            SystemRoot: process.env.SystemRoot,
            GITHUB_OUTPUT: output.replace(/\\/g, '/'),
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            DISPATCH_SOURCE: 'cloudflare-cron-v1',
            DISPATCH_RETENTION: 'frequent',
            AUTOMATION_ENABLED: 'true',
            SCHEDULED_FOR_UTC: '2026-09-30T02:23:00.000Z',
            RECOVERY_CANDIDATE_SHA: 'a'.repeat(40),
            RECOVERY_RETENTION_CLASS: 'frequent',
            MANUAL_CONFIRMATION: 'BACKUP_PRODUCTION',
            ...overrides,
          },
        },
      );
      if (result.error) throw new Error('Local workflow gate test could not launch Bash.');
      return {
        status: result.status,
        output: result.status === 0 && script === gate ? readFileSync(output, 'utf8') : '',
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  it.each(['schedule', 'workflow_dispatch'])('requires exact true for automatic %s', (event) => {
    expect(execute(gate, { GITHUB_EVENT_NAME: event }).output).toContain('should-run=true');
    for (const enabled of ['', 'false', 'TRUE']) {
      expect(
        execute(gate, { GITHUB_EVENT_NAME: event, AUTOMATION_ENABLED: enabled }).output,
      ).toContain('should-run=false');
    }
  });
  it('keeps confirmed manual frequent/weekly requests independent of automation', () => {
    expect(
      execute(gate, {
        DISPATCH_SOURCE: 'manual',
        SCHEDULED_FOR_UTC: '',
        AUTOMATION_ENABLED: 'false',
      }).output,
    ).toContain('should-run=true');
    for (const retention of ['frequent', 'weekly'])
      expect(execute(request, { RECOVERY_RETENTION_CLASS: retention }).status).toBe(0);
    expect(execute(request, { MANUAL_CONFIRMATION: 'wrong' }).status).not.toBe(0);
    expect(execute(request, { RECOVERY_CANDIDATE_SHA: 'main' }).status).not.toBe(0);
  });
  it.each([
    { DISPATCH_SOURCE: 'unknown' },
    { DISPATCH_RETENTION: 'weekly' },
    { SCHEDULED_FOR_UTC: '' },
    { SCHEDULED_FOR_UTC: '2026-02-30T02:23:00.000Z' },
    { SCHEDULED_FOR_UTC: '2026-09-30T02:23:00x000Z' },
    { SCHEDULED_FOR_UTC: '2026-09-30T02:23:00Z' },
    { DISPATCH_SOURCE: 'manual' },
    { GITHUB_EVENT_NAME: 'push' },
  ])('rejects invalid workflow gate input %#', (overrides) => {
    expect(execute(gate, overrides).status).not.toBe(0);
  });
});

describe('independent scheduled dispatch (no provider access)', () => {
  it.each(['pkcs1', 'pkcs8'] as const)(
    'signs a verifiable RS256 JWT from %s and dispatches once',
    async (type) => {
      const fetcher = transport();
      const invocation = controller();
      await expect(worker.scheduled(invocation, environment(type))).resolves.toBeUndefined();
      expect(invocation.noRetry).toHaveBeenCalledOnce();
      expect(invocation.noRetry.mock.invocationCallOrder[0]).toBeLessThan(
        fetcher.mock.invocationCallOrder[0],
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [tokenUrl, tokenRequest] = fetcher.mock.calls[0];
      expect(tokenUrl).toBe('https://api.github.com/app/installations/456/access_tokens');
      expect(JSON.parse(tokenRequest!.body as string)).toEqual({
        repositories: ['fixture-repository'],
        permissions: { actions: 'write' },
      });
      const jwt = (tokenRequest!.headers as Record<string, string>).Authorization.slice(7);
      const [header, payload, signature] = jwt.split('.');
      expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
        alg: 'RS256',
        typ: 'JWT',
      });
      expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
        iss: '123',
        iat: now.getTime() / 1000 - 60,
        exp: now.getTime() / 1000 + 540,
      });
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          keys.publicKey,
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(true);
      const [dispatchUrl, dispatchRequest] = fetcher.mock.calls[1];
      expect(dispatchUrl).toBe(
        'https://api.github.com/repos/fixture-owner/fixture-repository/actions/workflows/backup-production.yml/dispatches',
      );
      expect(JSON.parse(dispatchRequest!.body as string)).toEqual({
        ref: 'main',
        inputs: {
          candidate_sha: 'a'.repeat(40),
          confirmation: 'BACKUP_PRODUCTION',
          retention_class: 'frequent',
          trigger_source: 'cloudflare-cron-v1',
          scheduled_for_utc: now.toISOString(),
        },
      });
      expect((dispatchRequest!.headers as Record<string, string>).Authorization).toBe(
        'Bearer synthetic-installation-value',
      );
      for (const [, request] of fetcher.mock.calls) {
        expect(request!.redirect).toBe('manual');
        expect(request!.method).toBe('POST');
        expect(request!.signal).toBeDefined();
      }
    },
  );

  it.each([
    'cron',
    'timestamp',
    'sha',
    'app',
    'installation',
    'owner',
    'repository',
    'workflow',
    'pem',
  ])('fails closed for invalid %s before any request', async (invalid) => {
    const fetcher = transport();
    const invocation = controller();
    const env = environment();
    if (invalid === 'cron') invocation.cron = '* * * * *';
    if (invalid === 'timestamp') invocation.scheduledTime = NaN;
    if (invalid === 'sha') env.BACKUP_CANDIDATE_SHA = 'main';
    if (invalid === 'app') env.GITHUB_APP_ID = 'invalid';
    if (invalid === 'installation') env.GITHUB_INSTALLATION_ID = '../other';
    if (invalid === 'owner') env.GITHUB_OWNER = '../other';
    if (invalid === 'repository') env.GITHUB_REPOSITORY = '../other';
    if (invalid === 'workflow') env.GITHUB_WORKFLOW = 'deploy-production.yml';
    if (invalid === 'pem') env.GITHUB_APP_PRIVATE_KEY = 'private-invalid-material';
    await expect(worker.scheduled(invocation, env)).rejects.toThrow(
      /^BACKUP_SCHEDULER_DISPATCH_NOT_CONFIRMED$/,
    );
    expect(invocation.noRetry).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'token-rejected',
    'token-expired',
    'token-malformed',
    'token-network',
    'dispatch-rejected',
    'dispatch-network',
  ])('never retries after %s and never exposes errors/credentials', async (mode) => {
    const fetcher = transport();
    fetcher.mockReset();
    if (mode === 'token-network')
      fetcher.mockRejectedValueOnce(new Error('private-provider-material'));
    else
      fetcher.mockResolvedValueOnce(
        new Response(
          mode === 'token-malformed'
            ? 'private-invalid-json'
            : JSON.stringify({
                token: 'synthetic-installation-value',
                expires_at:
                  mode === 'token-expired' ? '2026-09-29T01:00:00Z' : '2026-09-30T03:23:00Z',
              }),
          { status: mode === 'token-rejected' ? 403 : 201 },
        ),
      );
    if (mode === 'dispatch-network')
      fetcher.mockRejectedValueOnce(new Error('private-ambiguous-timeout'));
    else fetcher.mockResolvedValueOnce(new Response('private-provider-error', { status: 503 }));
    const logs = ['log', 'error', 'warn', 'info', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log'),
    );
    await expect(worker.scheduled(controller(), environment())).rejects.toThrow(
      /^BACKUP_SCHEDULER_DISPATCH_NOT_CONFIRMED$/,
    );
    expect(fetcher).toHaveBeenCalledTimes(mode.startsWith('dispatch-') ? 2 : 1);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  describe.each(['installation-token', 'workflow-dispatch'] as const)(
    '%s redirect refusal',
    (endpoint) => {
      it.each(Array.from({ length: 100 }, (_, index) => 300 + index))(
        'rejects HTTP %i without following, retrying or exposing provider material',
        async (status) => {
          const fetcher = transport();
          fetcher.mockReset();
          if (endpoint === 'workflow-dispatch') {
            fetcher.mockResolvedValueOnce(
              new Response(
                JSON.stringify({
                  token: 'synthetic-installation-value',
                  expires_at: '2026-09-30T03:23:00Z',
                }),
                { status: 201 },
              ),
            );
          }
          // A null body also permits HTTP 304; no redirect response may be parsed.
          const redirect = new Response(null, {
            status,
            headers: { Location: 'https://untrusted.invalid/private-provider-material' },
          });
          const readBody = vi.spyOn(redirect, 'json');
          fetcher.mockResolvedValueOnce(redirect);
          const logs = ['log', 'error', 'warn', 'info', 'debug'].map((method) =>
            vi.spyOn(console, method as 'log'),
          );
          const invocation = controller();
          await expect(worker.scheduled(invocation, environment())).rejects.toThrow(
            /^BACKUP_SCHEDULER_DISPATCH_NOT_CONFIRMED$/,
          );
          expect(invocation.noRetry).toHaveBeenCalledOnce();
          expect(fetcher).toHaveBeenCalledTimes(endpoint === 'installation-token' ? 1 : 2);
          expect(readBody).not.toHaveBeenCalled();
          for (const [url, request] of fetcher.mock.calls) {
            expect(new URL(url as string).origin).toBe('https://api.github.com');
            expect(request!.redirect).toBe('manual');
            expect(request!.method).toBe('POST');
          }
          if (endpoint === 'installation-token') {
            expect(fetcher.mock.calls[0][0]).toBe(
              'https://api.github.com/app/installations/456/access_tokens',
            );
          }
          for (const log of logs) expect(log).not.toHaveBeenCalled();
        },
      );
    },
  );

  it('exposes scheduled execution only, keeps provider activation disabled and has no backup authority', async () => {
    expect(Object.keys(worker)).toEqual(['scheduled']);
    const directory = resolve(process.cwd(), '../../infra/cloudflare/production-backup-scheduler');
    const source = await readFile(resolve(directory, 'worker.ts'), 'utf8');
    const parsed = parseConfigFileTextToJson(
      'wrangler.jsonc',
      await readFile(resolve(directory, 'wrangler.jsonc'), 'utf8'),
    );
    expect(parsed.error).toBeUndefined();
    const config = parsed.config;
    expect(config.triggers.crons).toEqual([]);
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.vars.BACKUP_CANDIDATE_SHA).not.toMatch(/^[a-f0-9]{40}$/);
    expect(config.vars).not.toHaveProperty('GITHUB_APP_PRIVATE_KEY');
    expect(source).not.toMatch(
      /console\.|DATABASE_URL|R2_ACCESS|AGE_IDENTITY|BACKUP_HEARTBEAT_URL|repository_dispatch/,
    );
    expect(source.match(/\/dispatches/g)).toHaveLength(1);
    expect(source).toContain('controller.noRetry()');
  });
});
