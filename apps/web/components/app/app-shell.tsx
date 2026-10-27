'use client';

import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@school/shared';
import { Button } from '@school/ui';
import type { MeResponseDto } from '@/lib/api/me';
import { useTranslations } from 'next-intl';
import { AppContextProvider } from './app-context';
import { NavigationLinks } from './navigation-links';
import { ProfileMenu } from './profile-menu';
import { NotificationUnreadBadge } from '@/components/notifications/notification-unread-badge';
import { BrandMark } from '@/components/branding/brand-mark';

export function AppShell({ context, children }: { context: MeResponseDto; children: ReactNode }) {
  const t = useTranslations('shell');
  const navigation = useTranslations('navigation');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const trigger = mobileTriggerRef.current;
    const content = contentRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (content) content.inert = true;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const panel = closeButtonRef.current?.closest('[role="dialog"]');
        const focusable = Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const desktop = window.matchMedia?.('(min-width: 1024px)');
    const onResize = () => { if (desktop?.matches) setMobileOpen(false); };
    desktop?.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      desktop?.removeEventListener('change', onResize);
      document.body.style.overflow = previousOverflow;
      if (content) content.inert = false;
      trigger?.focus();
    };
  }, [mobileOpen]);

  if (!context.currentSchool) return null;

  return (
    <AppContextProvider value={context}>
      <div className="madrasio-workspace ws-layout">
        <aside
          data-testid="desktop-sidebar"
          className={cn(
            'ws-sidebar fixed inset-y-0 start-0 z-30 hidden border-e transition-[width] motion-reduce:transition-none lg:flex lg:flex-col',
            collapsed ? 'w-[var(--app-sidebar-collapsed-width)]' : 'w-[var(--app-sidebar-width)]',
          )}
        >
          <div className={cn('flex h-[var(--app-topbar-height)] shrink-0 items-center border-b px-5', collapsed && 'justify-center px-3')}>
            <BrandMark variant={collapsed ? 'logo' : 'wordmark'} priority />
          </div>
          <div className="flex-1 overflow-y-auto py-4"><NavigationLinks role={context.currentSchool.role} platformAuthority={context.platformAuthority} collapsed={collapsed} /></div>
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size={collapsed ? 'icon' : 'default'} className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')} aria-label={collapsed ? t('navigation.expand') : t('navigation.collapse')} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <ChevronsRight className="size-4 rtl:rotate-180" aria-hidden="true" /> : <><ChevronsLeft className="size-4 rtl:rotate-180" aria-hidden="true" /><span>{t('navigation.collapse')}</span></>}
            </Button>
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-foreground/40" aria-label={t('navigation.close')} onClick={() => setMobileOpen(false)} />
            <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label={navigation('landmark')} className="absolute inset-y-0 start-0 flex h-full w-[min(20rem,85vw)] flex-col bg-chrome text-chrome-foreground shadow-xl">
              <div className="flex h-[var(--app-topbar-height)] shrink-0 items-center justify-between gap-3 border-b px-4">
                <BrandMark className="h-9 w-40" />
                <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" aria-label={t('navigation.close')} onClick={() => setMobileOpen(false)}><X className="size-5" aria-hidden="true" /></Button>
              </div>
              <div data-testid="drawer-scroll-region" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="py-4"><NavigationLinks role={context.currentSchool.role} platformAuthority={context.platformAuthority} onNavigate={() => setMobileOpen(false)} /></div>
              </div>
            </aside>
          </div>
        ) : null}

        <div ref={contentRef} aria-hidden={mobileOpen || undefined} className={cn('transition-[padding] motion-reduce:transition-none', collapsed ? 'lg:ps-[var(--app-sidebar-collapsed-width)]' : 'lg:ps-[var(--app-sidebar-width)]')}>
          <header className="ws-navbar sticky top-0 z-20 flex h-[var(--app-topbar-height)] items-center gap-1 border-b px-[var(--app-page-padding)] sm:gap-3">
            <Button ref={mobileTriggerRef} data-testid="mobile-navigation-trigger" type="button" variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label={t('navigation.open')} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen(true)}><Menu className="size-5" aria-hidden="true" /></Button>
            <div className="min-w-0 flex-1" />
            <NotificationUnreadBadge />
            <ProfileMenu key={context.currentSchool.id} context={context} />
          </header>
          <main className="min-h-[calc(100vh-var(--app-topbar-height))] p-[var(--app-page-padding)]">{children}</main>
        </div>
      </div>
    </AppContextProvider>
  );
}
