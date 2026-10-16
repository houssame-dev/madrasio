// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import { createLanguageController } from '@/lib/frontend/language/controller';
import { softNavigationDisposition } from '@/lib/frontend/language/coherence';
import type { LanguageTransport } from '@/lib/frontend/language/api';
import type { LanguagePreferenceDto } from '@/lib/modules/user-language/domain/contracts';
import { ApiClientError } from '@/lib/frontend/api-client';

const preference = (locale: SupportedLocale | null): LanguagePreferenceDto => ({ preferredLocale: locale, effectiveLocale: locale ?? 'en' });
function deferred<T>() {
  let finish: (value: T) => void = () => { throw new Error('Deferred promise not initialized'); };
  const promise = new Promise<T>((resolve) => { finish = resolve; });
  return { promise, resolve: (value: T) => finish(value) };
}
function harness(userId = 'user-a') {
  let current = true;
  const invalidators = new Set<() => void>();
  const transport = { read: vi.fn<LanguageTransport['read']>().mockResolvedValue(preference('en')),
    write: vi.fn<LanguageTransport['write']>().mockResolvedValue(preference('fr')) };
  const boundary = { holdDocumentSnapshot: vi.fn(), dispose: vi.fn() };
  const navigateDocument = vi.fn<() => void | Promise<void>>();
  const lifetime = { userId, isCurrent: () => current,
    onInvalidate(listener: () => void) { invalidators.add(listener); return () => { invalidators.delete(listener); }; } };
  const controller = createLanguageController({ lifetime, documentLocale: 'en', transport, boundary, navigateDocument });
  return { controller, transport, navigateDocument, boundary,
    revoke() { current = false; invalidators.forEach((listener) => listener()); } };
}

describe('prepared identity-bound language transitions', () => {
  it('has no read or navigation at construction/import time', () => {
    const h = harness(); expect(h.transport.read).not.toHaveBeenCalled(); expect(h.navigateDocument).not.toHaveBeenCalled();
    h.controller.dispose();
  });
  it('requires a held navigation boundary before initialization reads', async () => {
    const h = harness(); h.boundary.holdDocumentSnapshot.mockImplementation(() => { throw new Error('no routing admission'); });
    await h.controller.start();
    expect(h.transport.read).not.toHaveBeenCalled(); expect(h.controller.getSnapshot().phase).toBe('unavailable');
    h.controller.dispose();
  });
  it('rechecks the held boundary on an explicit retry after initialization was refused', async () => {
    const h = harness();
    h.boundary.holdDocumentSnapshot.mockImplementationOnce(() => { throw new Error('not held'); });
    await h.controller.start();
    expect(h.transport.read).not.toHaveBeenCalled();
    await h.controller.revalidate();
    expect(h.boundary.holdDocumentSnapshot).toHaveBeenCalledTimes(2);
    expect(h.transport.read).toHaveBeenCalledTimes(1);
    h.controller.dispose();
  });
  it('cancels before PATCH or document navigation', async () => {
    const h = harness(); await h.controller.start();
    h.controller.select('fr'); h.controller.requestSave(); expect(h.controller.getSnapshot().phase).toBe('confirm-save');
    h.controller.cancel();
    expect(h.transport.write).not.toHaveBeenCalled(); expect(h.navigateDocument).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().selected).toBe('en'); h.controller.dispose();
  });
  it('allows explicit English to replace NULL without losing the distinction', async () => {
    const h = harness(); h.transport.read.mockResolvedValueOnce(preference(null)).mockResolvedValue(preference('en'));
    await h.controller.start(); expect(h.controller.getSnapshot().observed?.preferredLocale).toBeNull();
    h.controller.requestSave(); await h.controller.confirm();
    expect(h.transport.write).toHaveBeenCalledWith('en', expect.any(AbortSignal));
    expect(h.controller.getSnapshot().observed?.preferredLocale).toBe('en'); h.controller.dispose();
  });
  it('serializes duplicate confirmations and reconciles a successful PATCH through a fresh GET', async () => {
    const h = harness(); await h.controller.start();
    const patch = deferred<LanguagePreferenceDto>(); h.transport.write.mockReturnValue(patch.promise);
    h.transport.read.mockResolvedValue(preference('fr'));
    h.controller.select('fr'); h.controller.requestSave();
    const first = h.controller.confirm(); const duplicate = h.controller.confirm();
    expect(h.transport.write).toHaveBeenCalledTimes(1);
    patch.resolve(preference('fr')); await Promise.all([first, duplicate]);
    expect(h.transport.read).toHaveBeenCalledTimes(2); expect(h.navigateDocument).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().phase).toBe('transitioning'); h.controller.dispose();
  });
  it('reconciles a lost PATCH response without retrying the write', async () => {
    const h = harness(); await h.controller.start();
    h.transport.write.mockRejectedValue(new Error('lost response')); h.transport.read.mockResolvedValue(preference('fr'));
    h.controller.select('fr'); h.controller.requestSave(); await h.controller.confirm();
    expect(h.transport.write).toHaveBeenCalledTimes(1); expect(h.navigateDocument).toHaveBeenCalledTimes(1);
    h.controller.dispose();
  });
  it('holds ambiguous outcomes until a successful fresh read and another deliberate Apply confirmation', async () => {
    const h = harness(); await h.controller.start();
    h.transport.write.mockRejectedValue(new Error('lost response')); h.transport.read.mockRejectedValueOnce(new Error('read unavailable'));
    h.controller.select('fr'); h.controller.requestSave(); await h.controller.confirm();
    expect(h.controller.getSnapshot().phase).toBe('uncertain');
    h.controller.requestSave(); await h.controller.confirm();
    expect(h.transport.write).toHaveBeenCalledTimes(1); expect(h.navigateDocument).not.toHaveBeenCalled();
    h.transport.read.mockResolvedValue(preference('fr')); await h.controller.revalidate();
    expect(h.controller.getSnapshot()).toMatchObject({ phase: 'idle', message: 'saved' });
    expect(h.navigateDocument).not.toHaveBeenCalled();
    h.controller.requestApply(); await h.controller.confirm();
    expect(h.navigateDocument).toHaveBeenCalledTimes(1); expect(h.transport.write).toHaveBeenCalledTimes(1); h.controller.dispose();
  });
  it('does not treat a delayed PATCH response as database commit ordering', async () => {
    const h = harness(); await h.controller.start();
    h.transport.write.mockResolvedValue(preference('fr')); h.transport.read.mockResolvedValue(preference('ar'));
    h.controller.select('fr'); h.controller.requestSave(); await h.controller.confirm();
    expect(h.controller.getSnapshot().observed).toEqual(preference('ar'));
    expect(h.controller.getSnapshot().message).toBe('remoteChanged');
    expect(h.transport.write).toHaveBeenCalledTimes(1); expect(h.navigateDocument).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it('rejects older reads even when an injected transport ignores cancellation', async () => {
    const h = harness(); await h.controller.start();
    const old = deferred<LanguagePreferenceDto>(); const fresh = deferred<LanguagePreferenceDto>();
    h.transport.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = h.controller.revalidate(); const second = h.controller.revalidate();
    fresh.resolve(preference('ar')); await second; old.resolve(preference('en')); await first;
    expect(h.controller.getSnapshot().observed).toEqual(preference('ar')); h.controller.dispose();
  });
  it('invalidates an event read before opening a deliberate save confirmation', async () => {
    const h = harness(); await h.controller.start();
    const read = deferred<LanguagePreferenceDto>(); h.transport.read.mockReturnValueOnce(read.promise);
    const pending = h.controller.revalidate(); h.controller.select('fr'); h.controller.requestSave();
    read.resolve(preference('ar')); await pending;
    expect(h.controller.getSnapshot().phase).toBe('confirm-save'); expect(h.transport.write).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it.each(['user-a', 'user-b'])('rejects old-account reads after logout/new login as %s', async (nextUser) => {
    const first = harness(); await first.controller.start();
    const response = deferred<LanguagePreferenceDto>(); first.transport.read.mockReturnValueOnce(response.promise);
    const pending = first.controller.revalidate(); const signal = first.transport.read.mock.calls.at(-1)?.[0];
    first.revoke();
    const next = harness(nextUser); next.transport.read.mockResolvedValue(preference('ar')); await next.controller.start();
    response.resolve(preference('fr')); await pending;
    expect(signal?.aborted).toBe(true); expect(first.controller.getSnapshot().observed).toBeUndefined();
    expect(next.controller.getSnapshot().observed).toEqual(preference('ar')); expect(first.navigateDocument).not.toHaveBeenCalled();
    first.controller.dispose(); next.controller.dispose();
  });
  it('cannot continue an old PATCH into reconciliation/navigation after revocation', async () => {
    const h = harness(); await h.controller.start(); const patch = deferred<LanguagePreferenceDto>();
    h.transport.write.mockReturnValue(patch.promise); h.controller.select('fr'); h.controller.requestSave();
    const pending = h.controller.confirm(); h.revoke(); patch.resolve(preference('fr')); await pending;
    expect(h.controller.getSnapshot().phase).toBe('revoked');
    expect(h.transport.read).toHaveBeenCalledTimes(1); expect(h.navigateDocument).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it('offers remote Apply/Later without writing a stale local preference', async () => {
    const h = harness(); h.transport.read.mockResolvedValue(preference('fr')); await h.controller.start();
    h.controller.later(); await h.controller.revalidate();
    expect(h.controller.getSnapshot()).toMatchObject({ deferred: true, message: 'deferred', selected: 'en' });
    expect(h.transport.write).not.toHaveBeenCalled(); expect(h.navigateDocument).not.toHaveBeenCalled();
    expect(h.boundary.holdDocumentSnapshot).toHaveBeenCalledTimes(1);
    expect(softNavigationDisposition('en', 'fr')).toBe('hold-for-document-transition');
    expect(softNavigationDisposition('en', undefined)).toBe('hold-for-document-transition');
    expect(softNavigationDisposition('en', 'en')).toBe('coherent');
    h.controller.requestApply(); await h.controller.confirm();
    expect(h.transport.write).not.toHaveBeenCalled(); expect(h.navigateDocument).toHaveBeenCalledTimes(1); h.controller.dispose();
  });
  it('requires renewed consent if the remote preference changes during Apply confirmation', async () => {
    const h = harness(); h.transport.read.mockResolvedValueOnce(preference('fr')).mockResolvedValue(preference('ar'));
    await h.controller.start(); h.controller.requestApply(); await h.controller.confirm();
    expect(h.controller.getSnapshot()).toMatchObject({ phase: 'idle', observed: preference('ar'), message: 'remoteChanged' });
    expect(h.navigateDocument).not.toHaveBeenCalled(); expect(h.transport.write).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it('retains confirmed persistence after navigation failure and retries only a fresh confirmed transition', async () => {
    const h = harness(); await h.controller.start(); h.transport.read.mockResolvedValue(preference('fr'));
    h.navigateDocument.mockRejectedValueOnce(new Error('navigation blocked'));
    h.controller.select('fr'); h.controller.requestSave(); await h.controller.confirm();
    expect(h.controller.getSnapshot()).toMatchObject({ phase: 'navigation-failed', observed: preference('fr'), message: 'navigationFailed' });
    h.controller.requestApply(); h.controller.cancel(); expect(h.navigateDocument).toHaveBeenCalledTimes(1);
    h.controller.requestApply(); await h.controller.confirm();
    expect(h.navigateDocument).toHaveBeenCalledTimes(2); expect(h.transport.write).toHaveBeenCalledTimes(1); h.controller.dispose();
  });
  it('retains the last coherent snapshot on failed revalidation without claiming a successful read', async () => {
    const h = harness(); await h.controller.start(); h.transport.read.mockRejectedValue(new Error('private-details'));
    await h.controller.revalidate();
    expect(h.controller.getSnapshot()).toMatchObject({ phase: 'unavailable', observed: preference('en'), message: 'readFailed', selected: 'en' });
    expect(h.transport.write).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it('disables actions and clears personal state after an authoritative access denial', async () => {
    const h = harness(); await h.controller.start();
    h.transport.read.mockRejectedValue(new ApiClientError(403, { code: 'FORBIDDEN', message: 'private' }));
    await h.controller.revalidate(); h.controller.select('ar'); h.controller.requestSave();
    expect(h.controller.getSnapshot().phase).toBe('revoked');
    expect(h.controller.getSnapshot().observed).toBeUndefined();
    expect(h.transport.write).not.toHaveBeenCalled(); h.controller.dispose();
  });
  it.todo('ADMITTED AUTH/BROWSER: prove the real trusted lifetime revokes before logout, same-User relogin and account switches');
  it.todo('ADMITTED NEXT/BROWSER: Later then Link/router/prefetch/history/query navigation must hold ALL mismatched RSC requests and commits');
  it.todo('ADMITTED DATABASE/NETWORK: concurrent device writes and ambiguous commits require authoritative storage evidence');
  it.todo('ADMITTED BROWSER: prove beforeunload cancellation, failed location.assign, completed document navigation and unsaved-work behavior');
});
