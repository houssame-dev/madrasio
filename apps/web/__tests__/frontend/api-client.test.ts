import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiRequest } from '@/lib/frontend/api-client';

afterEach(() => vi.restoreAllMocks());

describe('browser API client', () => {
  it('parses a successful JSON envelope with same-origin credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: 'one' } }));
    await expect(apiRequest('/api/v1/me')).resolves.toEqual({ data: { id: 'one' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('preserves controlled code, feature code, and validation details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'VALIDATION_ERROR', featureCode: 'INVALID_CONTEXT', message: 'Request validation failed.', details: { issues: [{ path: 'name' }] } } }, { status: 400 }));
    const error = await apiRequest('/api/v1/students').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', featureCode: 'INVALID_CONTEXT', details: { issues: [{ path: 'name' }] } });
  });

  it('uses a safe fallback for non-JSON server failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('postgres: relation secrets', { status: 500, headers: { 'content-type': 'text/plain' } }));
    const error = await apiRequest('/api/v1/students').catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 500, code: 'REQUEST_FAILED' });
    expect((error as Error).message).not.toContain('postgres');
  });

  it('does not render a backend 500 message even when it is JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'SQL constraint private_name' } }, { status: 500 }));
    const error = await apiRequest('/api/v1/students').catch((value: unknown) => value);
    expect((error as Error).message).not.toContain('SQL');
  });
});
