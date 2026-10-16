// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { observeAccountAuthEvents, type AccountAuthListener } from '@/lib/frontend/language/auth-events';
import { createAccountLifetimeRegistry } from '@/lib/frontend/language/account-lifetime';
import { createLanguageController } from '@/lib/frontend/language/controller';
import type { LanguagePreferenceDto } from '@/lib/modules/user-language/domain/contracts';
import type { LanguageTransport } from '@/lib/frontend/language/api';

// Synthetic values only. No SDK instance, listener, credentials or network startup.
function session(id = 'user-a', token = 'synthetic-first', signedInAt = '2026-10-15T00:00:00Z'): Session {
  return { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer',
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: signedInAt, last_sign_in_at: signedInAt } };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Not initialized'); };
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve: (value: T) => resolve(value) };
}
const preference = (locale: 'en' | 'fr'): LanguagePreferenceDto => ({ preferredLocale: locale, effectiveLocale: locale });
function fixture() {
  const verify = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue('user-a');
  const registry = createAccountLifetimeRegistry({ verifyCurrentUser: verify });
  const owner = registry.createOwner('user-a');
  let listener: AccountAuthListener = () => { throw new Error('Not subscribed'); };
  const unsubscribe = vi.fn();
  const observer = observeAccountAuthEvents({ invalidate: registry.invalidate,
    subscribe(callback) { listener = callback; return unsubscribe; } });
  const emit = (event: AuthChangeEvent, value: Session | null) => listener(event, value);
  async function acquire() {
    if (!await observer.ready || !observer.isAvailable()) return null;
    return owner.acquire();
  }
  const dispose = () => { observer.dispose(); owner.dispose(); registry.dispose(); };
  return { verify, registry, owner, observer, emit, acquire, unsubscribe, dispose };
}
async function controllerFixture() {
  const h = fixture(); h.emit('INITIAL_SESSION', session());
  const lease = await h.acquire();
  if (!lease) throw new Error('Expected verified lease');
  const transport = { read: vi.fn<LanguageTransport['read']>().mockResolvedValue(preference('en')),
    write: vi.fn<LanguageTransport['write']>().mockResolvedValue(preference('fr')) };
  const navigateDocument = vi.fn<() => void>();
  const controller = createLanguageController({ lifetime: lease.lifetime, documentLocale: 'en', transport, navigateDocument,
    // Unit adapter only; this does not prove real navigation admission.
    boundary: { holdDocumentSnapshot() {}, dispose() {} } });
  return { ...h, lease, transport, navigateDocument, controller };
}

describe('browser Auth invalidation signals, never an identity authority', () => {
  it('waits for initialization and requires fresh /me; client identity cannot grant a lease', async () => {
    const h = fixture(); const pending = h.acquire();
    expect(h.verify).not.toHaveBeenCalled();
    h.verify.mockResolvedValue('other-user'); h.emit('INITIAL_SESSION', session());
    expect(await pending).toBeNull(); expect(h.verify).toHaveBeenCalledOnce(); h.dispose();
  });
  it('does not reuse an already settled readiness promise after immediate logout', async () => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); h.emit('SIGNED_OUT', null);
    expect(await h.acquire()).toBeNull(); expect(h.verify).not.toHaveBeenCalled(); h.dispose();
  });
  it('preserves duplicate SIGNED_IN and normal refresh, including the refreshed duplicate', async () => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const lease = await h.acquire();
    h.emit('SIGNED_IN', session());
    h.emit('TOKEN_REFRESHED', session('user-a', 'synthetic-rotated'));
    h.emit('SIGNED_IN', session('user-a', 'synthetic-rotated'));
    expect(lease?.lifetime.isCurrent()).toBe(true); expect(h.verify).toHaveBeenCalledOnce(); h.dispose();
  });
  it('revokes same-user replacement login even without an intervening logout event', async () => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const old = await h.acquire();
    h.emit('SIGNED_IN', session('user-a', 'synthetic-new-login'));
    expect(old?.lifetime.isCurrent()).toBe(false); expect(await h.acquire()).toBeNull();
    // A separately started observer and fresh server check are needed to recover.
    h.observer.dispose();
    const next = observeAccountAuthEvents({ invalidate: h.registry.invalidate, subscribe(listener) {
      listener('INITIAL_SESSION', session('user-a', 'synthetic-new-login')); return () => {};
    } });
    expect(await next.ready).toBe(true);
    const fresh = await h.owner.acquire(); expect(fresh?.lifetime.isCurrent()).toBe(true);
    expect(fresh?.lifetime).not.toBe(old?.lifetime); expect(h.verify).toHaveBeenCalledTimes(2);
    expect(old?.lifetime.isCurrent()).toBe(false); next.dispose(); h.dispose();
  });
  it.each(['SIGNED_IN', 'TOKEN_REFRESHED'] as const)('revokes a different-user %s without granting that identity', async (event) => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const lease = await h.acquire();
    h.emit(event, session('user-b', 'synthetic-other'));
    expect(lease?.lifetime.isCurrent()).toBe(false); expect(await h.acquire()).toBeNull();
    expect(h.verify).toHaveBeenCalledOnce(); h.dispose();
  });
  it('does not classify a changed sign-in timestamp as ordinary refresh', async () => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const lease = await h.acquire();
    h.emit('TOKEN_REFRESHED', session('user-a', 'synthetic-later', '2026-10-15T00:01:00Z'));
    expect(lease?.lifetime.isCurrent()).toBe(false); h.dispose();
  });
  it.each(['SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'] as const)('conservatively revokes on %s', async (event) => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const lease = await h.acquire();
    h.emit(event, event === 'SIGNED_OUT' ? null : session());
    expect(lease?.lifetime.isCurrent()).toBe(false); expect(h.observer.isAvailable()).toBe(false); h.dispose();
  });
  it('aborts stale /me verification and rejects its late response', async () => {
    const h = fixture(); const response = deferred<string>(); h.verify.mockReturnValue(response.promise);
    h.emit('INITIAL_SESSION', session()); const pending = h.acquire(); await Promise.resolve();
    const signal = h.verify.mock.lastCall?.[0]; h.emit('SIGNED_OUT', null);
    expect(signal?.aborted).toBe(true); response.resolve('user-a'); expect(await pending).toBeNull(); h.dispose();
  });
  it('aborts pending preference GET and refuses late results after logout/relogin', async () => {
    const h = await controllerFixture(); const response = deferred<LanguagePreferenceDto>(); h.transport.read.mockReturnValue(response.promise);
    const pending = h.controller.start(); h.emit('SIGNED_OUT', null); h.emit('SIGNED_IN', session('user-a', 'synthetic-again'));
    expect(h.transport.read.mock.calls[0][0].aborted).toBe(true);
    response.resolve(preference('fr')); await pending;
    expect(h.controller.getSnapshot().phase).toBe('revoked'); expect(h.controller.getSnapshot().observed).toBeUndefined();
    expect(h.navigateDocument).not.toHaveBeenCalled(); h.controller.dispose(); h.dispose();
  });
  it('aborts PATCH, ignores its late completion and cannot navigate the replacement account', async () => {
    const h = await controllerFixture(); await h.controller.start();
    const response = deferred<LanguagePreferenceDto>(); h.transport.write.mockReturnValue(response.promise);
    h.controller.select('fr'); h.controller.requestSave(); const pending = h.controller.confirm();
    h.emit('SIGNED_IN', session('user-b', 'synthetic-other'));
    expect(h.transport.write.mock.calls[0][1].aborted).toBe(true);
    response.resolve(preference('fr')); await pending;
    expect(h.transport.read).toHaveBeenCalledOnce(); expect(h.navigateDocument).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().phase).toBe('revoked'); h.controller.dispose(); h.dispose();
  });
  it('unsubscribes exactly once, revokes on cleanup and ignores queued callbacks', async () => {
    const h = fixture(); h.emit('INITIAL_SESSION', session()); const lease = await h.acquire();
    h.observer.dispose(); h.observer.dispose(); expect(h.unsubscribe).toHaveBeenCalledOnce();
    h.emit('SIGNED_IN', session()); expect(lease?.lifetime.isCurrent()).toBe(false);
    expect(h.observer.isAvailable()).toBe(false); h.dispose();
  });
  it('settles an uninitialized subscription on cleanup without starting /me', async () => {
    const h = fixture(); const pending = h.acquire(); h.observer.dispose();
    expect(await pending).toBeNull(); expect(h.verify).not.toHaveBeenCalled(); h.dispose();
  });
  it('fails closed if subscription setup throws', async () => {
    const invalidate = vi.fn();
    const observer = observeAccountAuthEvents({ invalidate, subscribe() { throw new Error('Synthetic setup failure'); } });
    expect(await observer.ready).toBe(false); expect(observer.isAvailable()).toBe(false);
    expect(invalidate).toHaveBeenCalled(); observer.dispose();
  });
  it.todo('separately admitted browser proof: server cookie logout does not guarantee an SDK event');
  it.todo('separately reviewed runtime proof: delayed cross-tab refresh after logout or newer login');
});
