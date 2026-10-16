import type { SupportedLocale } from '@school/shared';

/**
 * Every RSC acquisition/commit must agree with the persistent document snapshot.
 * This policy is not itself a Next.js interception mechanism.
 */
export function softNavigationDisposition(documentLocale: SupportedLocale, serverLocale: SupportedLocale | undefined) {
  return serverLocale === documentLocale ? 'coherent' as const : 'hold-for-document-transition' as const;
}

/**
 * Required future host boundary: holds ALL soft navigation/prefetch/history and
 * in-flight RSC commits before allowing preference resolution to diverge.
 * It must hold even BEFORE an event read discovers a cross-device change.
 * No existing reviewed adapter supplies this contract: activation stays disabled.
 */
export interface LanguageNavigationBoundary {
  holdDocumentSnapshot(): void;
  dispose(): void;
}

/**
 * Concrete fail-closed adapter while App Router commit admission is unresolved.
 * Public push/replace/refresh/back/forward return void; Link onNavigate does not
 * control viewport prefetch, history restoration or an in-flight Flight commit.
 * No click wrapper, pathname effect or interface is accepted as a commit fence.
 * This adapter intentionally prevents the controller from starting; it does NOT
 * intercept Next or claim to hold a document snapshot.
 */
export function createUnadmittedLanguageNavigationBoundary(): LanguageNavigationBoundary {
  return {
    holdDocumentSnapshot() { throw new Error('Language navigation is not admitted.'); },
    dispose() {},
  };
}
