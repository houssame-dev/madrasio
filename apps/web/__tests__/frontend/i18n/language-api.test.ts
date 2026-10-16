// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { languageApi } from '@/lib/frontend/language/api';

afterEach(() => vi.restoreAllMocks());
it('reads the private self resource with no identity/school override or cache', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { preferredLocale: null, effectiveLocale: 'en' } }));
  const signal = new AbortController().signal;
  expect(await languageApi.read(signal)).toEqual({ preferredLocale: null, effectiveLocale: 'en' });
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/language', expect.objectContaining({ signal, cache: 'no-store', credentials: 'same-origin' }));
});
it('writes only the non-null supported locale and never retries a failed transport', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('transport unavailable'));
  const signal = new AbortController().signal;
  await expect(languageApi.write('ar', signal)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/language', expect.objectContaining({
    method: 'PATCH', body: '{"preferredLocale":"ar"}', signal, credentials: 'same-origin', cache: 'no-store',
  }));
});
it.each([
  { preferredLocale: 'ar', effectiveLocale: 'en' },
  { preferredLocale: 'de', effectiveLocale: 'en' },
  { effectiveLocale: 'en' },
  { preferredLocale: null, effectiveLocale: 'en', userId: 'other' },
])('rejects malformed or incoherent success envelopes: %j', async (data) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data }));
  await expect(languageApi.read(new AbortController().signal)).rejects.toThrow('Invalid language response.');
});
