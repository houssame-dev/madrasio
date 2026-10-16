'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { SupportedLocale } from '@school/shared';
import { languageApi, type LanguageTransport } from '@/lib/frontend/language/api';
import { createLanguageController, initialLanguageState, type AccountLifetime, type LanguageController, type LanguageState } from '@/lib/frontend/language/controller';
import type { LanguageNavigationBoundary } from '@/lib/frontend/language/coherence';

/** Fixed current-document destination; no query/response-provided URL or router.refresh. */
export function navigateCurrentDocument() { window.location.assign(window.location.href); }

export interface LanguagePreferenceOptions {
  lifetime: AccountLifetime;
  boundary: LanguageNavigationBoundary;
  documentLocale: SupportedLocale;
  transport?: LanguageTransport;
  navigateDocument?: () => void | Promise<void>;
}

/** Required host dependencies must be stable for one authenticated document lifetime. */
export function useLanguagePreference({
  lifetime, boundary, documentLocale, transport = languageApi, navigateDocument = navigateCurrentDocument,
}: LanguagePreferenceOptions) {
  const pathname = usePathname();
  const route = pathname + '?' + useSearchParams().toString();
  const [view, setView] = useState<{ owner: AccountLifetime; state: LanguageState }>(() => ({
    owner: lifetime, state: initialLanguageState(documentLocale),
  }));
  const reference = useRef<{ owner: AccountLifetime; controller: LanguageController } | null>(null);
  const previousPath = useRef(route);
  useEffect(() => {
    const controller = createLanguageController({ lifetime, boundary, documentLocale, transport, navigateDocument });
    reference.current = { owner: lifetime, controller };
    const unsubscribe = controller.subscribe((state) => setView({ owner: lifetime, state }));
    setView({ owner: lifetime, state: controller.getSnapshot() });
    void controller.start();
    const focus = () => { void controller.revalidate(); };
    const visible = () => { if (document.visibilityState === 'visible') focus(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    return () => {
      unsubscribe(); controller.dispose();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
      if (reference.current?.controller === controller) reference.current = null;
    };
  }, [lifetime, boundary, documentLocale, transport, navigateDocument]);
  useEffect(() => {
    if (previousPath.current === route) return;
    previousPath.current = route;
    if (reference.current?.owner === lifetime) void reference.current.controller.revalidate();
  }, [route, lifetime]);
  // Suppress the previous account's state immediately on render, before effect cleanup.
  const state = view.owner === lifetime ? view.state : initialLanguageState(documentLocale);
  function current() { return reference.current?.owner === lifetime ? reference.current.controller : undefined; }
  return {
    state,
    select: (value: unknown) => current()?.select(value),
    requestSave: () => current()?.requestSave(),
    cancel: () => current()?.cancel(),
    requestApply: () => current()?.requestApply(),
    later: () => current()?.later(),
    confirm: () => { void current()?.confirm(); },
    revalidate: () => { void current()?.revalidate(); },
  };
}
