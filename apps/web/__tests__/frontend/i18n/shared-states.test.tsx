import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '@school/shared';
import {
  AccessDeniedState, ApiErrorState, EmptyState, InlineLoading, NoSchoolState, PageLoading,
} from '@/components/ui/states';
import { getCatalog } from '@/i18n/catalogs';
import { renderParents } from '../parents/test-helpers';

afterEach(cleanup);

function renderState(ui: ReactNode, locale: SupportedLocale = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    {ui}
  </NextIntlClientProvider>);
}

const defaults = [
  ['en', 'Loading your workspace…', 'We could not load this page.', 'Please try again. If the problem continues, contact your administrator.', 'Try again', 'Access unavailable', 'This section is not available for your current school role.', 'No active school', 'Your account does not currently have an active school membership.'],
  ['fr', 'Chargement de votre espace de travail…', 'Nous n’avons pas pu charger cette page.', 'Veuillez réessayer. Si le problème persiste, contactez votre administrateur.', 'Réessayer', 'Accès indisponible', 'Cette section n’est pas disponible pour votre rôle actuel dans l’établissement.', 'Aucun établissement actif', 'Votre compte ne dispose actuellement d’aucune adhésion active à un établissement.'],
  ['ar', 'جارٍ تحميل مساحة عملك…', 'تعذّر تحميل هذه الصفحة.', 'يرجى إعادة المحاولة. إذا استمرت المشكلة، فتواصل مع المسؤول.', 'إعادة المحاولة', 'الوصول غير متاح', 'هذا القسم غير متاح لدورك الحالي في المدرسة.', 'لا توجد مدرسة نشطة', 'لا توجد حاليًا عضوية مدرسية نشطة مرتبطة بحسابك.'],
] as const;

describe('localized shared-state defaults', () => {
  it.each(defaults)('renders all eight %s defaults with existing semantics', (
    locale, loading, errorTitle, errorDescription, retry, deniedTitle, deniedDescription,
    noSchoolTitle, noSchoolDescription,
  ) => {
    const onRetry = vi.fn();
    const view = renderState(<>
      <PageLoading />
      <InlineLoading />
      <ApiErrorState onRetry={onRetry} />
      <AccessDeniedState />
      <NoSchoolState />
    </>, locale);

    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      expect(status).toHaveTextContent(loading);
      expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(statuses[0]).toHaveAttribute('aria-live', 'polite');
    expect(statuses[1]).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('heading', { level: 2, name: errorTitle })).toBeInTheDocument();
    expect(screen.getByText(errorDescription)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: deniedTitle })).toBeInTheDocument();
    expect(screen.getByText(deniedDescription)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: noSchoolTitle })).toBeInTheDocument();
    expect(screen.getByText(noSchoolDescription)).toBeInTheDocument();
    for (const section of view.container.querySelectorAll('section')) {
      expect(section.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
    }
    const button = screen.getByRole('button', { name: retry });
    expect(button).toHaveAttribute('type', 'button');
    expect(onRetry).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps explicit caller text authoritative in a non-English context', () => {
    renderState(<>
      <PageLoading label="Caller page loading" />
      <InlineLoading label="Caller inline loading" />
      <ApiErrorState title="Caller error" description="Caller error detail" />
      <AccessDeniedState title="Caller denial" description="Caller denial detail" />
    </>, 'fr');
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual([
      'Caller page loading', 'Caller inline loading',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Caller error' })).toBeInTheDocument();
    expect(screen.getByText('Caller error detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Caller denial' })).toBeInTheDocument();
    expect(screen.getByText('Caller denial detail')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('preserves empty-string overrides without substituting translated defaults', () => {
    const view = renderState(<>
      <PageLoading label="" />
      <InlineLoading label="" />
      <ApiErrorState title="" description="" />
      <AccessDeniedState title="" description="" />
    </>, 'ar');
    for (const status of screen.getAllByRole('status')) expect(status.textContent).toBe('');
    expect(screen.getByRole('heading', { level: 1, name: '' })).toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { level: 2, name: '' })).toBeEmptyDOMElement();
    expect(view.container.querySelector('p')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies defaults for explicitly undefined props and omits retry without a callback', () => {
    renderState(<>
      <PageLoading label={undefined} />
      <InlineLoading label={undefined} />
      <ApiErrorState title={undefined} description={undefined} onRetry={undefined} />
      <AccessDeniedState title={undefined} description={undefined} />
    </>);
    for (const status of screen.getAllByRole('status')) {
      expect(status).toHaveTextContent('Loading your workspace…');
    }
    expect(screen.getByRole('heading', { name: 'We could not load this page.' })).toBeInTheDocument();
    expect(screen.getByText('Please try again. If the problem continues, contact your administrator.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(screen.getByText('This section is not available for your current school role.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('preserves caller-owned ReactNode actions, including false and null', () => {
    renderState(<>
      <AccessDeniedState action={<a href="/caller-access"><strong>Caller access action</strong></a>} />
      <NoSchoolState action={<button type="button"><span>Caller school action</span></button>} />
      <AccessDeniedState title="No action" action={false} />
      <NoSchoolState action={null} />
    </>, 'ar');
    expect(screen.getByRole('link', { name: 'Caller access action' })).toHaveAttribute('href', '/caller-access');
    expect(screen.getByRole('button', { name: 'Caller school action' }).querySelector('span')).toHaveTextContent('Caller school action');
    const noActionSection = screen.getByRole('heading', { name: 'No action' }).closest('section');
    expect(noActionSection?.querySelector('a, button')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps EmptyState entirely caller-owned without an intl provider', () => {
    const view = render(<EmptyState title="Caller empty title" description="Caller empty detail"
      action={<a href="/caller-empty"><em>Caller empty action</em></a>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Caller empty title' })).toBeInTheDocument();
    expect(screen.getByText('Caller empty detail')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Caller empty action' })).toHaveAttribute('href', '/caller-empty');
    expect(view.container.querySelector('section > span')).toHaveAttribute('aria-hidden', 'true');
    view.rerender(<EmptyState title="" description="" action={false} />);
    expect(screen.getByRole('heading', { level: 2, name: '' })).toBeEmptyDOMElement();
    expect(view.container.querySelector('p')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    view.rerender(<EmptyState title="No description" action={null} />);
    expect(screen.getByRole('heading', { level: 2, name: 'No description' })).toBeInTheDocument();
    expect(view.container.querySelector('p')).toBeNull();
  });

  it('retains parent intl context for replacement Query-only rerenders', () => {
    const view = renderParents(<InlineLoading />, 'PARENT');
    view.queryClient.setQueryData(['state-provider-proof'], 'preserved');
    expect(within(view.container).getByRole('status')).toHaveTextContent('Loading your workspace…');
    view.rerender(<QueryClientProvider client={view.queryClient}><ApiErrorState /></QueryClientProvider>);
    expect(within(view.container).getByRole('heading', { level: 2, name: 'We could not load this page.' })).toBeInTheDocument();
    expect(view.queryClient.getQueryData(['state-provider-proof'])).toBe('preserved');
    view.rerender(<QueryClientProvider client={view.queryClient}><InlineLoading /></QueryClientProvider>);
    expect(within(view.container).getByRole('status')).toHaveTextContent('Loading your workspace…');
    view.unmount();
    view.queryClient.clear();
  });
});
