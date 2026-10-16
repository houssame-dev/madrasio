// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAccountLifetimeRegistry, type AccountOwner } from '@/lib/frontend/language/account-lifetime';
import { createLanguageController } from '@/lib/frontend/language/controller';
import type { LanguageTransport } from '@/lib/frontend/language/api';
import type { LanguagePreferenceDto } from '@/lib/modules/user-language/domain/contracts';

const preference = (locale: 'en' | 'fr' | 'ar'): LanguagePreferenceDto => ({ preferredLocale: locale, effectiveLocale: locale });
function deferred<T>() {
  let finish: (value: T) => void = () => { throw new Error('Not initialized'); };
  let fail: (error: unknown) => void = () => { throw new Error('Not initialized'); };
  const promise = new Promise<T>((resolve, reject) => { finish = resolve; fail = reject; });
  return { promise, resolve: (value: T) => finish(value), reject: (error: unknown) => fail(error) };
}
async function acquire(owner: AccountOwner) {
  const lease = await owner.acquire();
  if (!lease) throw new Error('Expected verified lease');
  return lease;
}
function fixture() {
  const verifyCurrentUser = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue('user-a');
  const registry = createAccountLifetimeRegistry({ verifyCurrentUser });
  const owner = registry.createOwner('user-a');
  const transport = { read: vi.fn<LanguageTransport['read']>().mockResolvedValue(preference('en')),
    write: vi.fn<LanguageTransport['write']>().mockResolvedValue(preference('fr')) };
  const navigateDocument = vi.fn<() => void | Promise<void>>();
  return { registry, owner, verifyCurrentUser, transport, navigateDocument };
}
// The injected boundary below is only for controller unit coverage. It provides
// no evidence of App Router/Flight commit safety.
const fakeBoundary = () => ({ holdDocumentSnapshot() {}, dispose() {} });

describe('document-local account ownership and actual B1F controller', () => {
  it('does not verify identity until a language consumer explicitly acquires', () => {
    const h = fixture(); expect(h.verifyCurrentUser).not.toHaveBeenCalled(); h.registry.dispose();
  });
  it('requires fresh server identity, not the entry prop, before issuing a lease', async () => {
    const h = fixture(); h.verifyCurrentUser.mockResolvedValue('other-user');
    expect(await h.owner.acquire()).toBeNull();
    expect(h.verifyCurrentUser).toHaveBeenCalledTimes(1); h.registry.dispose();
  });
  it('revokes a pending GET before the logout operation is invoked, ignoring its late result', async () => {
    const h = fixture(); const lease = await acquire(h.owner);
    const response = deferred<LanguagePreferenceDto>(); h.transport.read.mockReturnValue(response.promise);
    const controller = createLanguageController({ lifetime: lease.lifetime, documentLocale: 'en', transport: h.transport,
      boundary: fakeBoundary(), navigateDocument: h.navigateDocument });
    const pending = controller.start(); const signal = h.transport.read.mock.calls[0][0];
    const finish = h.registry.beginTransition();
    expect(signal.aborted).toBe(true); expect(lease.lifetime.isCurrent()).toBe(false);
    response.resolve(preference('fr')); await pending; finish();
    expect(controller.getSnapshot().phase).toBe('revoked'); expect(controller.getSnapshot().observed).toBeUndefined();
    expect(h.navigateDocument).not.toHaveBeenCalled(); controller.dispose(); h.registry.dispose();
  });
  it('revokes a pending PATCH without claiming that abort rolled back its database commit', async () => {
    const h = fixture(); const lease = await acquire(h.owner);
    const controller = createLanguageController({ lifetime: lease.lifetime, documentLocale: 'en', transport: h.transport,
      boundary: fakeBoundary(), navigateDocument: h.navigateDocument });
    await controller.start();
    const patch = deferred<LanguagePreferenceDto>(); h.transport.write.mockReturnValue(patch.promise);
    controller.select('fr'); controller.requestSave(); const pending = controller.confirm();
    const finish = h.registry.beginTransition();
    expect(h.transport.write.mock.calls[0][1].aborted).toBe(true);
    patch.resolve(preference('fr')); await pending; finish();
    expect(h.transport.read).toHaveBeenCalledTimes(1); expect(h.navigateDocument).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('revoked'); controller.dispose(); h.registry.dispose();
  });
  it('creates a new capability after same-user logout/relogin and never resurrects the previous one', async () => {
    const h = fixture(); const first = await acquire(h.owner);
    const finish = h.registry.beginTransition();
    expect(await h.owner.acquire()).toBeNull(); finish(); finish();
    const second = await acquire(h.owner);
    expect(second.lifetime.userId).toBe(first.lifetime.userId);
    expect(second.lifetime).not.toBe(first.lifetime);
    expect(first.lifetime.isCurrent()).toBe(false); expect(second.lifetime.isCurrent()).toBe(true);
    expect(h.verifyCurrentUser).toHaveBeenCalledTimes(2); h.registry.dispose();
  });
  it('keeps old verified-entry props from selecting a different logged-in User', async () => {
    const h = fixture(); const first = await acquire(h.owner);
    const finish = h.registry.beginTransition(); h.verifyCurrentUser.mockResolvedValue('user-b'); finish();
    expect(await h.owner.acquire()).toBeNull();
    const next = await acquire(h.registry.createOwner('user-b'));
    expect(next.lifetime.userId).toBe('user-b'); expect(first.lifetime.isCurrent()).toBe(false);
    h.registry.dispose();
  });
  it('denies conflicting simultaneous identity checks rather than trusting arrival order', async () => {
    const h = fixture(); const response = deferred<string>(); h.verifyCurrentUser.mockReturnValueOnce(response.promise);
    const first = h.owner.acquire(); const signal = h.verifyCurrentUser.mock.calls[0][0];
    expect(await h.registry.createOwner('user-b').acquire()).toBeNull();
    expect(signal.aborted).toBe(true); response.resolve('user-a'); expect(await first).toBeNull();
    h.verifyCurrentUser.mockResolvedValue('user-b');
    expect((await acquire(h.registry.createOwner('user-b'))).lifetime.userId).toBe('user-b');
    h.registry.dispose();
  });
  it('aborts identity verification at consumer unmount even if the host remains', async () => {
    const h = fixture(); const response = deferred<string>(); h.verifyCurrentUser.mockReturnValueOnce(response.promise);
    const consumer = new AbortController(); const pending = h.owner.acquire(consumer.signal);
    const signal = h.verifyCurrentUser.mock.calls[0][0]; consumer.abort();
    expect(signal.aborted).toBe(true); response.resolve('user-a'); expect(await pending).toBeNull(); h.registry.dispose();
  });
  it('cleans up only the unmounted entry while preserving another same-User entry', async () => {
    const h = fixture(); const first = await acquire(h.owner);
    const other = h.registry.createOwner('user-a'); const second = await acquire(other);
    h.owner.dispose();
    expect(first.lifetime.isCurrent()).toBe(false); expect(second.lifetime.isCurrent()).toBe(true);
    h.registry.dispose(); expect(second.lifetime.isCurrent()).toBe(false);
  });
  it('does not let a broken observer prevent other revocations or Auth initiation', async () => {
    const h = fixture(); const first = await acquire(h.owner); const second = await acquire(h.owner);
    first.lifetime.onInvalidate(() => { throw new Error('broken UI observer'); });
    const observed = vi.fn(); second.lifetime.onInvalidate(observed);
    expect(() => h.registry.beginTransition()()).not.toThrow();
    expect(observed).toHaveBeenCalledOnce(); expect(first.lifetime.isCurrent()).toBe(false); h.registry.dispose();
  });
  it('does not treat failed verification as successful identity or revive a failed Auth attempt', async () => {
    const h = fixture(); const old = await acquire(h.owner);
    const finish = h.registry.beginTransition(); finish();
    expect(old.lifetime.isCurrent()).toBe(false);
    h.verifyCurrentUser.mockRejectedValue(new Error('verification unavailable'));
    expect(await h.owner.acquire()).toBeNull(); h.registry.dispose();
  });
  it('treats cache identity observations as invalidation only, requiring fresh server evidence to reissue', async () => {
    const h = fixture(); const old = await acquire(h.owner);
    h.registry.observeUserId('user-b');
    expect(old.lifetime.isCurrent()).toBe(false);
    expect(await h.registry.createOwner('user-b').acquire()).toBeNull();
    expect(old.lifetime.isCurrent()).toBe(false);
    h.registry.dispose();
  });
  it.each(['school', 'school-selection', 'no-school', 'platform-only'])('requires only the verified global User for %s ownership', async () => {
    const h = fixture(); const lease = await acquire(h.owner);
    expect(lease.lifetime.isCurrent()).toBe(true);
    expect(h.verifyCurrentUser).toHaveBeenCalledWith(expect.any(AbortSignal));
    h.registry.dispose();
  });
  it('cancels obsolete remote Apply confirmations when the account changes after Later', async () => {
    const h = fixture(); const lease = await acquire(h.owner); h.transport.read.mockResolvedValue(preference('fr'));
    const controller = createLanguageController({ lifetime: lease.lifetime, documentLocale: 'en', transport: h.transport,
      boundary: fakeBoundary(), navigateDocument: h.navigateDocument });
    await controller.start(); controller.later();
    expect(h.transport.write).not.toHaveBeenCalled(); expect(h.navigateDocument).not.toHaveBeenCalled();
    const read = deferred<LanguagePreferenceDto>(); h.transport.read.mockReturnValueOnce(read.promise);
    controller.requestApply(); const pending = controller.confirm(); const finish = h.registry.beginTransition();
    read.resolve(preference('fr')); await pending; finish();
    expect(controller.getSnapshot().phase).toBe('revoked'); expect(h.navigateDocument).not.toHaveBeenCalled();
    controller.dispose(); h.registry.dispose();
  });
  it('does not restore navigation-failure feedback after account invalidation during an outstanding transition', async () => {
    const h = fixture(); const lease = await acquire(h.owner); h.transport.read.mockResolvedValue(preference('fr'));
    const navigation = deferred<void>(); const started = deferred<void>();
    h.navigateDocument.mockImplementation(() => { started.resolve(); return navigation.promise; });
    const controller = createLanguageController({ lifetime: lease.lifetime, documentLocale: 'en', transport: h.transport,
      boundary: fakeBoundary(), navigateDocument: h.navigateDocument });
    await controller.start(); controller.requestApply(); const pending = controller.confirm();
    await started.promise;
    const finish = h.registry.beginTransition(); navigation.reject(new Error('navigation failed')); await pending; finish();
    expect(controller.getSnapshot().phase).toBe('revoked'); expect(h.transport.write).not.toHaveBeenCalled();
    controller.dispose(); h.registry.dispose();
  });
  it.todo('ADMITTED AUTH: establish invalidation for cross-tab/external session changes not initiated through the instrumented UI');
  it.todo('ADMITTED AUTH/RSC: prove fresh /me, cookie timing, cached entry/history restoration and same-user new-session lifetime isolation');
});
