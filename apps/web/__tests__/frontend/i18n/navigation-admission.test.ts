// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createUnadmittedLanguageNavigationBoundary } from '@/lib/frontend/language/coherence';
import { createLanguageController } from '@/lib/frontend/language/controller';
import type { LanguageTransport } from '@/lib/frontend/language/api';

describe('actual fail-closed navigation admission', () => {
  it('refuses preference reads/writes/navigation instead of treating an interface as an RSC commit fence', async () => {
    const read = vi.fn<LanguageTransport['read']>(); const write = vi.fn<LanguageTransport['write']>(); const navigateDocument = vi.fn();
    const boundary = createUnadmittedLanguageNavigationBoundary();
    const controller = createLanguageController({
      lifetime: { userId: 'verified-user', isCurrent: () => true, onInvalidate: () => () => {} },
      documentLocale: 'en', boundary, transport: { read, write }, navigateDocument,
    });
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'unavailable', message: 'readFailed' });
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(navigateDocument).not.toHaveBeenCalled();
    await controller.revalidate();
    expect(read).not.toHaveBeenCalled(); controller.dispose();
  });
  it.todo('ADMITTED NEXT/BROWSER: Later then Link navigation, including keyboard activation, must preserve a coherent document');
  it.todo('ADMITTED NEXT/BROWSER: viewport/hover/explicit prefetch must not introduce a different-locale RSC subtree');
  it.todo('ADMITTED NEXT/BROWSER: router.push, replace and refresh need request AND commit admission');
  it.todo('ADMITTED NEXT/BROWSER: search/query changes must preserve the same document/provider/server context');
  it.todo('ADMITTED NEXT/BROWSER: back/forward and restored history/cache require a safe full-document boundary');
  it.todo('ADMITTED NEXT/BROWSER: reject already in-flight/prefetched Flight commits during Later or a pending transition');
  it.todo('ADMITTED NEXT/AUTH/BROWSER: account changes during RSC acquisition/commit must not restore an obsolete account or locale');
  it.todo('ADMITTED BROWSER: completed, blocked and failed full-document transitions must preserve confirmation and saved preference semantics');
});
