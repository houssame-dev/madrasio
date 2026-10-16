'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { queryKeys } from '@/lib/frontend/query';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { observeAccountAuthEvents } from '@/lib/frontend/language/auth-events';
import { createAccountLifetimeRegistry, type AccountLifetimeRegistry, type AccountOwner, type AccountLease } from '@/lib/frontend/language/account-lifetime';

const RegistryContext = createContext<AccountLifetimeRegistry | null>(null);
const OwnerContext = createContext<AccountOwner | null>(null);
const identity = z.object({ data: z.object({ user: z.object({ id: z.string().uuid() }) }) });
async function verifyCurrentUser(signal: AbortSignal) {
  const response = await apiRequest<unknown>('/api/v1/me', { signal, cache: 'no-store' });
  const parsed = identity.safeParse(response);
  if (!parsed.success) throw new Error('Current account could not be verified.');
  return parsed.data.data.user.id;
}

/**
 * No SDK client, token observation, identity read or preference request at mounting.
 * Local UI initiation is instrumented below. Only an explicit future language
 * consumer subscribes to the existing browser client; provider mounting does not.
 * Server cookie mutations still have no guaranteed browser event relay.
 */
export function AccountLifetimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [registry, setRegistry] = useState<AccountLifetimeRegistry | null>(null);
  useEffect(() => {
    // A new instance per effect setup is safe across Strict Mode cleanup/replay.
    const current = createAccountLifetimeRegistry({ verifyCurrentUser });
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey.length !== queryKeys.me.length || event.query.queryKey[0] !== queryKeys.me[0]) return;
      if (event.type === 'removed') { current.invalidate(); return; }
      if (event.type !== 'updated') return;
      const error = event.query.state.error;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        current.invalidate(); return;
      }
      if (event.action.type === 'success') {
        const parsed = identity.safeParse({ data: event.query.state.data });
        if (parsed.success) current.observeUserId(parsed.data.data.user.id);
      }
    });
    setRegistry(current);
    return () => { unsubscribe(); current.dispose(); };
  }, [queryClient]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

/** The prop comes only from the existing verified /me or platform authority entry. */
export function AuthenticatedAccountLifetimeHost({ verifiedUserId, children }: { verifiedUserId: string; children: ReactNode }) {
  const registry = useContext(RegistryContext);
  const [binding, setBinding] = useState<{ registry: AccountLifetimeRegistry; id: string; owner: AccountOwner } | null>(null);
  useEffect(() => {
    if (!registry) return;
    const owner = registry.createOwner(verifiedUserId);
    setBinding({ registry, id: verifiedUserId, owner });
    return () => owner.dispose();
  }, [registry, verifiedUserId]);
  const owner = binding && binding.registry === registry && binding.id === verifiedUserId ? binding.owner : null;
  return <OwnerContext.Provider value={owner}>{children}</OwnerContext.Provider>;
}

const noTransition = () => {};
/** Outside the root provider there is no language capability to revoke or grant. */
export function useBeginAccountTransition() {
  const registry = useContext(RegistryContext);
  return useCallback(() => registry ? registry.beginTransition() : noTransition, [registry]);
}

/**
 * PREPARED consumer bridge; no live selector calls it. A failed/revoked lease is
 * never silently reused. Reacquisition explicitly re-verifies /me, including
 * after the same User logs in again. It does not authorize a navigation boundary.
 */
export function useVerifiedAccountLifetime() {
  const owner = useContext(OwnerContext);
  const registry = useContext(RegistryContext);
  const [attempt, setAttempt] = useState(0);
  const [binding, setBinding] = useState<{ owner: AccountOwner; lease: AccountLease } | null>(null);
  useEffect(() => {
    if (!owner || !registry) return;
    let alive = true;
    const request = new AbortController();
    let lease: AccountLease | null = null;
    let unsubscribe: (() => void) | undefined;
    const observer = observeAccountAuthEvents({
      invalidate: registry.invalidate,
      subscribe(listener) {
        const { data: { subscription } } = getBrowserSupabase().auth.onAuthStateChange(listener);
        return () => subscription.unsubscribe();
      },
    });
    void observer.ready.then((available) => alive && available && observer.isAvailable() ? owner.acquire(request.signal) : null).then((result) => {
      if (!alive) { result?.release(); return; }
      if (!observer.isAvailable()) { result?.release(); setBinding(null); return; }
      lease = result;
      if (!result) { setBinding(null); return; }
      setBinding({ owner, lease: result });
      unsubscribe = result.lifetime.onInvalidate(() => setBinding(null));
    });
    return () => { alive = false; request.abort(); unsubscribe?.(); lease?.release(); observer.dispose(); };
  }, [owner, registry, attempt]);
  return {
    lifetime: binding && binding.owner === owner && binding.lease.lifetime.isCurrent() ? binding.lease.lifetime : null,
    reverify: () => setAttempt((value) => value + 1),
  };
}
