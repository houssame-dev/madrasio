'use client';

import { Building2, ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@school/shared';
import { Button } from '@school/ui';
import type { MeResponseDto } from '@/lib/api/me';
import { copy, roleLabels } from '@/lib/frontend/copy';
import { AppContextProvider } from './app-context';
import { NavigationLinks } from './navigation-links';
import { SchoolSwitcher } from './school-selector';
import { NotificationUnreadBadge } from '@/components/notifications/notification-unread-badge';
import { LogoutButton } from '@/components/auth/logout-button';

export function AppShell({ context, children }: { context: MeResponseDto; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const school = context.memberships.find((membership) => membership.schoolId === context.currentSchool?.id);

  useEffect(() => {
    if (!mobileOpen) return;
    const trigger = mobileTriggerRef.current;
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
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [mobileOpen]);

  if (!context.currentSchool) return null;

  return (
    <AppContextProvider value={context}>
      <div className="min-h-screen bg-muted/30">
        <aside
          data-testid="desktop-sidebar"
          className={cn(
            'fixed inset-y-0 start-0 z-30 hidden border-e bg-card transition-[width] md:flex md:flex-col',
            collapsed ? 'w-[var(--app-sidebar-collapsed-width)]' : 'w-[var(--app-sidebar-width)]',
          )}
        >
          <div className="flex h-[var(--app-topbar-height)] items-center gap-3 border-b px-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Building2 className="size-5" aria-hidden="true" /></span>
            {!collapsed ? <span className="truncate text-sm font-semibold">{copy.productName}</span> : null}
          </div>
          <div className="flex-1 overflow-y-auto py-4"><NavigationLinks role={context.currentSchool.role} collapsed={collapsed} /></div>
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size={collapsed ? 'icon' : 'default'} className={cn(!collapsed && 'w-full justify-start')} aria-label={collapsed ? copy.expandNavigation : copy.collapseNavigation} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <ChevronsRight className="size-4" aria-hidden="true" /> : <><ChevronsLeft className="size-4" aria-hidden="true" /><span>{copy.collapseNavigation}</span></>}
            </Button>
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button className="absolute inset-0 bg-foreground/40" aria-label={copy.closeNavigation} onClick={() => setMobileOpen(false)} />
            <aside role="dialog" aria-modal="true" aria-label={copy.navigation} className="relative flex h-full w-[min(20rem,85vw)] flex-col bg-card shadow-xl">
              <div className="flex h-[var(--app-topbar-height)] items-center justify-between border-b px-4">
                <span className="font-semibold">{copy.productName}</span>
                <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" aria-label={copy.closeNavigation} onClick={() => setMobileOpen(false)}><X className="size-5" aria-hidden="true" /></Button>
              </div>
              <div className="overflow-y-auto py-4"><NavigationLinks role={context.currentSchool.role} onNavigate={() => setMobileOpen(false)} /></div>
            </aside>
          </div>
        ) : null}

        <div className={cn('transition-[padding]', collapsed ? 'md:ps-[var(--app-sidebar-collapsed-width)]' : 'md:ps-[var(--app-sidebar-width)]')}>
          <header className="sticky top-0 z-20 flex h-[var(--app-topbar-height)] items-center gap-3 border-b bg-background/95 px-[var(--app-page-padding)] backdrop-blur">
            <Button ref={mobileTriggerRef} data-testid="mobile-navigation-trigger" type="button" variant="ghost" size="icon" className="md:hidden" aria-label={copy.openNavigation} onClick={() => setMobileOpen(true)}><Menu className="size-5" aria-hidden="true" /></Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{school?.schoolName ?? copy.currentSchool}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabels[context.currentSchool.role]}</p>
            </div>
            <NotificationUnreadBadge />
            <SchoolSwitcher memberships={context.memberships} currentSchoolId={context.currentSchool.id} />
            <LogoutButton variant="ghost" compact />
          </header>
          <main className="min-h-[calc(100vh-var(--app-topbar-height))] p-[var(--app-page-padding)]">{children}</main>
        </div>
      </div>
    </AppContextProvider>
  );
}
