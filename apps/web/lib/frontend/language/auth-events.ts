import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type AccountAuthListener = (event: AuthChangeEvent, session: Session | null) => void;
interface Dependencies {
  subscribe(listener: AccountAuthListener): () => void;
  invalidate(): void;
}

/**
 * Invalidation only: never verifies identity or calls Auth from an Auth callback.
 * An opaque access-token equality marker distinguishes repeated SIGNED_IN from
 * replacement sessions. It is not decoded, persisted, logged, returned or used
 * for requests/authorization. Refresh updates the marker without revoking a
 * known unchanged account; ambiguous changes revoke conservatively.
 * Server cookie writes are NOT guaranteed to emit browser SDK notifications.
 */
export function observeAccountAuthEvents({ subscribe, invalidate }: Dependencies) {
  let alive = true;
  let observed = false;
  let available = false;
  let userId: string | undefined;
  let token: string | undefined;
  let signedInAt: string | undefined;
  let settle: (available: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => { settle = resolve; });
  // No lease may span the unobserved subscription/INITIAL_SESSION interval.
  invalidate();
  let unsubscribe = () => {};
  try {
    unsubscribe = subscribe((event, session) => {
      if (!alive) return;
      const nextId = session?.user.id;
      const nextToken = session?.access_token;
      const nextSignIn = session?.user.last_sign_in_at;
      const sameAccount = observed && !!nextId && nextId === userId;
      const duplicate = sameAccount && !!nextToken && nextToken === token && nextSignIn === signedInAt;
      const ordinaryRefresh = event === 'TOKEN_REFRESHED' && sameAccount && nextSignIn === signedInAt;
      const changed = !session || event === 'SIGNED_OUT'
        || (!ordinaryRefresh && !(['INITIAL_SESSION', 'SIGNED_IN'].includes(event) && duplicate));
      if (!observed || changed) invalidate();
      // After a change, only explicit resubscription plus fresh /me may recover.
      // In particular a settled readiness promise must not outlive SIGNED_OUT.
      available = !observed ? !!nextId && !!nextToken && event !== 'SIGNED_OUT' : available && !changed;
      observed = true;
      userId = nextId; token = nextToken; signedInAt = nextSignIn;
      // Merely enables a subsequent fresh server /me check, never grants a lease.
      settle(available);
    });
  } catch {
    available = false; invalidate(); settle(false);
  }
  return {
    ready,
    isAvailable: () => alive && available,
    dispose() {
      if (!alive) return;
      alive = false;
      available = false;
      userId = undefined; token = undefined; signedInAt = undefined;
      settle(false);
      invalidate();
      unsubscribe();
    },
  };
}
