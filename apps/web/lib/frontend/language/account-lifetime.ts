import type { AccountLifetime } from './controller';

export interface AccountLease { lifetime: AccountLifetime; release(): void }
export interface AccountOwner { acquire(signal?: AbortSignal): Promise<AccountLease | null>; dispose(): void }
interface Dependencies { verifyCurrentUser(signal: AbortSignal): Promise<string> }

/**
 * Document-local operation ownership, not an Auth/session store. An entry's ID
 * is only an expectation: fresh server /me verification must agree before a
 * lease is issued. Events can revoke ownership but can never establish identity.
 */
export function createAccountLifetimeRegistry(dependencies: Dependencies) {
  let epoch = 0;
  let disposed = false;
  const transitions = new Set<symbol>();
  const requests = new Map<AbortController, string>();
  const leases = new Set<{ userId: string; revoke(): void }>();
  const owners = new Set<AccountOwner>();
  function invalidate() {
    epoch++;
    requests.forEach((_id, request) => request.abort());
    requests.clear();
    [...leases].forEach((lease) => lease.revoke());
  }
  return {
    /** Synchronous: call BEFORE invoking existing login/logout/recovery operations. */
    beginTransition() {
      const ticket = Symbol();
      if (!disposed) { transitions.add(ticket); invalidate(); }
      let finished = false;
      return () => {
        if (finished) return;
        finished = true; transitions.delete(ticket);
        // Finishing never resurrects a previous lease or declares login success.
      };
    },
    invalidate,
    /** Cache/entry observations can only revoke, never issue identity or a lease. */
    observeUserId(userId: string) {
      if ([...leases].some((lease) => lease.userId !== userId)
        || [...requests.values()].some((id) => id !== userId)) invalidate();
    },
    createOwner(expectedUserId: string): AccountOwner {
      let alive = !disposed;
      const ownedRequests = new Set<AbortController>();
      const ownedLeases = new Set<AccountLease>();
      const owner: AccountOwner = {
        async acquire(signal) {
          if (!alive || disposed || transitions.size || signal?.aborted) return null;
          // Conflicting verification flights have no trustworthy arrival order.
          // Refuse both; a later deliberate attempt must obtain fresh evidence.
          if ([...requests.values()].some((id) => id !== expectedUserId)) { invalidate(); return null; }
          if ([...leases].some((lease) => lease.userId !== expectedUserId)) invalidate();
          const version = epoch;
          const request = new AbortController();
          const cancel = () => request.abort();
          signal?.addEventListener('abort', cancel, { once: true });
          requests.set(request, expectedUserId); ownedRequests.add(request);
          let verifiedUserId: string;
          try { verifiedUserId = await dependencies.verifyCurrentUser(request.signal); }
          catch {
            if (alive && !disposed && version === epoch && !request.signal.aborted) invalidate();
            return null;
          } finally {
            signal?.removeEventListener('abort', cancel);
            requests.delete(request); ownedRequests.delete(request);
          }
          if (!alive || disposed || request.signal.aborted || version !== epoch || transitions.size) return null;
          if (!verifiedUserId || verifiedUserId !== expectedUserId) { invalidate(); return null; }
          // Concurrent entries for the same User are fine; an account change
          // revokes all earlier scopes before issuing the new capability.
          if ([...leases].some((lease) => lease.userId !== verifiedUserId)) invalidate();
          const issuedEpoch = epoch;
          let valid = true;
          const listeners = new Set<() => void>();
          const record = { userId: verifiedUserId, revoke() {
            if (!valid) return;
            valid = false; leases.delete(record);
            [...listeners].forEach((listener) => {
              // A broken UI observer must not prevent Auth initiation or other revocations.
              try { listener(); } catch { /* Ownership is already revoked; continue other observers. */ }
            });
            listeners.clear();
          } };
          const result: AccountLease = {
            lifetime: {
              userId: verifiedUserId,
              isCurrent: () => valid && alive && !disposed && issuedEpoch === epoch && transitions.size === 0,
              onInvalidate(listener) {
                if (!valid || !alive || disposed) { listener(); return () => {}; }
                listeners.add(listener); return () => { listeners.delete(listener); };
              },
            },
            release() { record.revoke(); ownedLeases.delete(result); },
          };
          leases.add(record); ownedLeases.add(result);
          return result;
        },
        dispose() {
          if (!alive) return;
          alive = false;
          ownedRequests.forEach((request) => { request.abort(); requests.delete(request); });
          ownedRequests.clear();
          [...ownedLeases].forEach((lease) => lease.release());
          owners.delete(owner);
        },
      };
      if (alive) owners.add(owner);
      return owner;
    },
    dispose() {
      if (disposed) return;
      disposed = true; invalidate();
      [...owners].forEach((owner) => owner.dispose()); transitions.clear();
    },
  };
}
export type AccountLifetimeRegistry = ReturnType<typeof createAccountLifetimeRegistry>;
