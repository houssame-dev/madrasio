import { isSupportedLocale, type SupportedLocale } from '@school/shared';
import { ApiClientError } from '@/lib/frontend/api-client';
import type { LanguagePreferenceDto } from '@/lib/modules/user-language/domain/contracts';
import type { LanguageTransport } from './api';
import type { LanguageNavigationBoundary } from './coherence';

/** UI ownership only, never API authorization. A trusted host must revoke before logout/account changes. */
export interface AccountLifetime {
  readonly userId: string;
  isCurrent(): boolean;
  onInvalidate(listener: () => void): () => void;
}
export type LanguagePhase = 'loading' | 'idle' | 'confirm-save' | 'confirm-apply' | 'saving'
  | 'reconciling' | 'uncertain' | 'transitioning' | 'navigation-failed' | 'unavailable' | 'revoked';
export type LanguageMessage = 'none' | 'readFailed' | 'saveUncertain' | 'saved' | 'remoteChanged'
  | 'deferred' | 'navigationFailed' | 'navigating' | 'revoked';
export interface LanguageState {
  phase: LanguagePhase;
  observed?: LanguagePreferenceDto;
  selected: SupportedLocale;
  selectedByUser: boolean;
  deferred: boolean;
  message: LanguageMessage;
}
interface Dependencies {
  lifetime: AccountLifetime;
  documentLocale: SupportedLocale;
  transport: LanguageTransport;
  boundary: LanguageNavigationBoundary;
  /** Must request the current URL as a full document, never router.refresh or an arbitrary destination. */
  navigateDocument(): void | Promise<void>;
}
type ReadResult = { kind: 'read'; preference: LanguagePreferenceDto } | { kind: 'failed' } | { kind: 'stale' };
export const initialLanguageState = (locale: SupportedLocale): LanguageState => ({
  phase: 'loading', selected: locale, selectedByUser: false, deferred: false, message: 'none',
});

/**
 * One controller per authenticated lifetime/document snapshot. No shared cache,
 * polling, persisted device preference or automatic write retry. Request sequence
 * suppresses stale reads only; it is NEVER interpreted as database commit order.
 */
export function createLanguageController(dependencies: Dependencies) {
  let state = initialLanguageState(dependencies.documentLocale);
  const listeners = new Set<(value: LanguageState) => void>();
  let active = false;
  let disposed = false;
  let readSequence = 0;
  let reading: AbortController | undefined;
  let writing: AbortController | undefined;
  let unsubscribe: (() => void) | undefined;
  let lastWrite: SupportedLocale | undefined;
  let expectedApply: LanguagePreferenceDto | undefined;
  const emit = () => listeners.forEach((listener) => listener(state));
  function revoke() {
    active = false; readSequence++; reading?.abort(); writing?.abort();
    lastWrite = undefined; expectedApply = undefined;
    state = { ...initialLanguageState(dependencies.documentLocale), phase: 'revoked', message: 'revoked' };
    emit();
  }
  function current() {
    if (!active || disposed) return false;
    if (!dependencies.lifetime.isCurrent()) { revoke(); return false; }
    return true;
  }
  function update(patch: Partial<LanguageState>) {
    if (!current()) return;
    state = { ...state, ...patch }; emit();
  }
  function denied(error: unknown) {
    if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
      revoke(); return true;
    }
    return false;
  }
  async function latest(): Promise<ReadResult> {
    if (!current()) return { kind: 'stale' };
    reading?.abort();
    const request = new AbortController();
    reading = request;
    const sequence = ++readSequence;
    try {
      const preference = await dependencies.transport.read(request.signal);
      if (!current() || request.signal.aborted || sequence !== readSequence) return { kind: 'stale' };
      return { kind: 'read', preference };
    } catch (error) {
      if (!current() || request.signal.aborted || sequence !== readSequence) return { kind: 'stale' };
      return denied(error) ? { kind: 'stale' } : { kind: 'failed' };
    } finally {
      if (reading === request) reading = undefined;
    }
  }
  function observe(preference: LanguagePreferenceDto) {
    const changed = state.observed?.preferredLocale !== preference.preferredLocale;
    update({ observed: preference, deferred: changed ? false : state.deferred });
  }
  async function navigate() {
    if (!current()) return;
    update({ phase: 'transitioning', message: 'navigating' });
    try {
      if (!current()) return;
      await dependencies.navigateDocument();
      // assign() returning is not evidence that a document loaded. Keep visible
      // pending/retry feedback if beforeunload or the browser prevents completion.
    } catch {
      update({ phase: 'navigation-failed', message: 'navigationFailed' });
    }
  }
  async function revalidate() {
    if (!active && !disposed && state.phase === 'unavailable') { await start(); return; }
    if (!current() || !['loading', 'idle', 'unavailable', 'uncertain'].includes(state.phase)) return;
    const uncertain = state.phase === 'uncertain';
    if (uncertain) update({ phase: 'reconciling' });
    const result = await latest();
    if (result.kind === 'stale') return;
    if (result.kind === 'failed') {
      update({ phase: uncertain ? 'uncertain' : 'unavailable', message: uncertain ? 'saveUncertain' : 'readFailed' });
      return;
    }
    observe(result.preference);
    const ownConfirmed = lastWrite !== undefined && result.preference.preferredLocale === lastWrite;
    update({ phase: 'idle', message: ownConfirmed ? 'saved'
      : result.preference.effectiveLocale !== dependencies.documentLocale ? (state.deferred ? 'deferred' : 'remoteChanged') : 'none' });
  }
  async function confirm() {
    if (!current()) return;
    if (state.phase === 'confirm-save') {
      const target = state.selected;
      // Exclusive write phase, set synchronously before the first await.
      update({ phase: 'saving', message: 'none' });
      readSequence++; reading?.abort();
      const request = new AbortController(); writing = request; lastWrite = target;
      try {
        await dependencies.transport.write(target, request.signal);
        // Even a successful PATCH response may be delayed behind another device's write.
      } catch (error) {
        if (!current() || denied(error)) return;
        // An aborted/lost/invalid response does not prove that a write did not commit.
      } finally {
        if (writing === request) writing = undefined;
      }
      if (!current()) return;
      update({ phase: 'reconciling' });
      const result = await latest();
      if (result.kind === 'stale') return;
      if (result.kind === 'failed') { update({ phase: 'uncertain', message: 'saveUncertain' }); return; }
      observe(result.preference);
      if (result.preference.preferredLocale === target) {
        update({ selectedByUser: false, message: 'saved' });
        await navigate();
      } else {
        // Fresh read wins. Never PATCH the old selection again to force our response to win.
        update({ phase: 'idle', selectedByUser: false, message: 'remoteChanged' });
      }
    } else if (state.phase === 'confirm-apply') {
      const expected = expectedApply;
      update({ phase: 'reconciling' });
      const result = await latest();
      if (result.kind === 'stale') return;
      if (result.kind === 'failed') { update({ phase: 'unavailable', message: 'readFailed' }); return; }
      observe(result.preference);
      if (!expected || result.preference.preferredLocale !== expected.preferredLocale) {
        update({ phase: 'idle', message: 'remoteChanged' }); return;
      }
      await navigate();
    }
  }
  async function start() {
    if (active || disposed) return;
    if (!dependencies.lifetime.isCurrent()) { revoke(); return; }
    try {
      // Mandatory BEFORE any read/remote discovery, not merely after choosing Later.
      dependencies.boundary.holdDocumentSnapshot();
    } catch {
      state = { ...state, phase: 'unavailable', message: 'readFailed' }; emit(); return;
    }
    active = true;
    unsubscribe = dependencies.lifetime.onInvalidate(revoke);
    await revalidate();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: (value: LanguageState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start,
    revalidate,
    select(value: unknown) {
      if (current() && state.phase === 'idle' && isSupportedLocale(value)) update({ selected: value, selectedByUser: true });
    },
    requestSave() {
      if (!current() || state.phase !== 'idle' || !state.observed) return;
      if (!state.selectedByUser && !(state.observed.preferredLocale === null && state.selected === 'en')) return;
      if (state.observed.preferredLocale === state.selected) return;
      readSequence++; reading?.abort();
      update({ phase: 'confirm-save', message: 'none' });
    },
    cancel() {
      if (!current() || !['confirm-save', 'confirm-apply'].includes(state.phase)) return;
      expectedApply = undefined;
      update({ phase: 'idle', selected: dependencies.documentLocale, selectedByUser: false });
    },
    requestApply() {
      if (!current() || !state.observed || !['idle', 'navigation-failed', 'transitioning'].includes(state.phase)) return;
      readSequence++; reading?.abort();
      expectedApply = state.observed;
      update({ phase: 'confirm-apply' });
    },
    later() {
      if (current() && state.phase === 'idle') update({ deferred: true, message: 'deferred' });
    },
    confirm,
    dispose() {
      if (disposed) return;
      disposed = true; active = false; readSequence++; reading?.abort(); writing?.abort();
      unsubscribe?.(); listeners.clear(); dependencies.boundary.dispose();
      lastWrite = undefined; expectedApply = undefined;
      state = { ...initialLanguageState(dependencies.documentLocale), phase: 'revoked', message: 'revoked' };
    },
  };
}
export type LanguageController = ReturnType<typeof createLanguageController>;
