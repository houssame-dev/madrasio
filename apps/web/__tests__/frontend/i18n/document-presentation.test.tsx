import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render, within } from '@testing-library/react';
import { useLocale, useTranslations } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localeDirection, SUPPORTED_LOCALES, type SupportedLocale } from '@school/shared';
import { DocumentPresentation } from '@/components/language/document-presentation';
import { RouteLoading } from '@/components/language/route-presentation';
import { getCatalog } from '@/i18n/catalogs';
import { createLanguageController } from '@/lib/frontend/language/controller';
import type { LanguageTransport } from '@/lib/frontend/language/api';
import StudentPage from '@/app/(app)/students/[id]/page';

const frames: HTMLIFrameElement[] = [];
afterEach(() => {
  cleanup();
  // Removing a happy-dom frame disposes its isolated window after React unmounts.
  frames.splice(0).forEach((frame) => frame.remove());
  vi.restoreAllMocks();
});

function Probe({ route, history, onDraftReady }: { route: string; history: string; onDraftReady?: (edit: (value: string) => void) => void }) {
  const locale = useLocale();
  const t = useTranslations('foundation');
  const [draft, setDraft] = useState('');
  useEffect(() => { onDraftReady?.(setDraft); }, [onDraftReady]);
  return <main>
    <output data-testid="locale">{locale}</output><p>{t('greeting', { name: 'Synthetic' })}</p>
    <output data-testid="route">{route}</output><bdi>{history}</bdi>
    <input aria-label="Synthetic draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <code dir="ltr">2026-10-15 / SYN-001</code>
  </main>;
}
function mounted(locale: SupportedLocale) {
  // An inline-only happy-dom frame supplies a real defaultView without network I/O.
  const frame = document.createElement('iframe');
  frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
  frames.push(frame);
  document.body.append(frame);
  const host = frame.contentDocument;
  if (!host?.defaultView) throw new Error('Expected an isolated window-backed document');
  let edit: ((value: string) => void) | undefined;
  const onDraftReady = (update: (value: string) => void) => { edit = update; };
  const element = (nextLocale: SupportedLocale, route: string) => <DocumentPresentation initialLocale={nextLocale}>
    <Probe route={route} history="Original سجل / historique" onDraftReady={onDraftReady} />
    <RouteLoading messageKey="peopleStudents.loadingStudent" />
  </DocumentPresentation>;
  const view = render(element(locale, '/students'), { container: host });
  expect(host.querySelectorAll('html')).toHaveLength(1);
  expect(host.querySelectorAll('body')).toHaveLength(1);
  expect(host.body.parentElement).toBe(host.documentElement);
  return { host, view, query: () => within(host.documentElement), element,
    editDraft(value: string) { act(() => { if (!edit) throw new Error('Draft not mounted'); edit(value); }); } };
}

function loadingStatus(host: Document, message: string) {
  const label = within(host.body).getByText(message, { exact: true, selector: 'span' });
  const status = label.closest('[role="status"]');
  if (!status) throw new Error('Expected the translated loading label inside a status indicator');
  return status;
}

describe('document presentation source boundary, not Next runtime proof', () => {
  it.each(SUPPORTED_LOCALES)('aligns %s initial SSR document attributes, catalog and client context', (locale) => {
    const html = renderToStaticMarkup(<DocumentPresentation initialLocale={locale}>
      <Probe route="/students" history="Original history" />
    </DocumentPresentation>);
    expect(html).toContain(`lang="${locale}"`); expect(html).toContain(`dir="${localeDirection(locale)}"`);
    expect(html).toContain(getCatalog(locale).foundation.greeting.replace('{name}', 'Synthetic'));
    expect(html).toContain('dir="ltr"'); expect(html).toContain('Original history');
  });
  it.each(['/students/second', '/students?page=2', '/students?filter=active'])('retains presentation and unsaved work when replacement inputs arrive for %s', (route) => {
    const h = mounted('ar'); h.editDraft('unsaved synthetic work');
    h.view.rerender(h.element('fr', route));
    expect(h.host.documentElement).toHaveAttribute('lang', 'ar'); expect(h.host.documentElement).toHaveAttribute('dir', 'rtl');
    expect(h.query().getByTestId('locale')).toHaveTextContent('ar');
    expect(loadingStatus(h.host, getCatalog('ar').peopleStudents.loadingStudent)).toHaveTextContent(getCatalog('ar').peopleStudents.loadingStudent);
    expect(h.query().getByTestId('route')).toHaveTextContent(route);
    expect(h.query().getByLabelText('Synthetic draft')).toHaveValue('unsaved synthetic work');
    expect(h.query().getByText('Original سجل / historique')).toBeInTheDocument();
    expect(h.query().getByText('2026-10-15 / SYN-001')).toHaveAttribute('dir', 'ltr');
  });
  it('keeps actual prefetched route props neutral and retains the domain identity', async () => {
    const id = 'synthetic-student'; const page = await StudentPage({ params: Promise.resolve({ id }) });
    expect(page.props.fallback.type).toBe(RouteLoading);
    expect(page.props.fallback.props).toEqual({ messageKey: 'peopleStudents.loadingStudent' });
    expect(page.props.children.props).toEqual({ studentId: id });
    const h = mounted('fr');
    h.view.rerender(<DocumentPresentation initialLocale="ar">{page.props.fallback}</DocumentPresentation>);
    expect(loadingStatus(h.host, getCatalog('fr').peopleStudents.loadingStudent)).toHaveTextContent(getCatalog('fr').peopleStudents.loadingStudent);
    expect(h.host.documentElement).toHaveAttribute('lang', 'fr');
  });
  it('keeps Later across simulated route/query/refresh input changes and requests Apply without mutating the old document', async () => {
    const h = mounted('en');
    const transport = { read: vi.fn<LanguageTransport['read']>().mockResolvedValue({ preferredLocale: 'ar', effectiveLocale: 'ar' }),
      write: vi.fn<LanguageTransport['write']>() };
    const navigateDocument = vi.fn<() => void>();
    const controller = createLanguageController({ documentLocale: 'en', transport, navigateDocument,
      lifetime: { userId: 'synthetic-user', isCurrent: () => true, onInvalidate: () => () => {} },
      // Unit adapter only. Production admission intentionally remains disabled.
      boundary: { holdDocumentSnapshot() {}, dispose() {} } });
    await controller.start(); controller.later();
    for (const route of ['/teachers', '/teachers?page=2', '/teachers?page=2']) {
      h.view.rerender(h.element('ar', route));
      expect(h.host.documentElement).toHaveAttribute('lang', 'en');
      expect(loadingStatus(h.host, getCatalog('en').peopleStudents.loadingStudent)).toHaveTextContent(getCatalog('en').peopleStudents.loadingStudent);
    }
    expect(controller.getSnapshot().deferred).toBe(true); expect(transport.write).not.toHaveBeenCalled();
    controller.requestApply(); await controller.confirm();
    expect(navigateDocument).toHaveBeenCalledOnce(); expect(h.host.documentElement).toHaveAttribute('lang', 'en');
    h.view.unmount();
    const next = mounted('ar'); expect(next.host.documentElement).toHaveAttribute('dir', 'rtl');
    expect(next.query().getByTestId('locale')).toHaveTextContent('ar'); controller.dispose();
  });
  it('allows a fresh document lifetime to establish a different presentation without carrying a draft', () => {
    const previous = mounted('fr');
    previous.editDraft('prior-account draft');
    previous.view.unmount(); const next = mounted('ar');
    expect(next.host.documentElement).toHaveAttribute('lang', 'ar');
    expect(next.query().getByLabelText('Synthetic draft')).toHaveValue('');
  });
  it.todo('ADMITTED NEXT RSC: actual Link/prefetch/push/replace/query/refresh/in-flight payloads preserve the root instance and document attributes');
  it.todo('ADMITTED AUTH/BROWSER: successful same-user/different-user login and logout load new documents; failed/cancelled navigation stays safe');
  it.todo('ADMITTED HISTORY/BFCACHE: restored old-account documents fail closed before personal UI becomes interactive');
  it.todo('ADMITTED SSR/HYDRATION: client-owned html/body and streaming metadata preserve the initial verified snapshot without mismatch');
});
