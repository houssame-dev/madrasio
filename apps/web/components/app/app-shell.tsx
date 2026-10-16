'use client';

import { Building2, ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@school/shared';
import { Button } from '@school/ui';
import type { MeResponseDto } from '@/lib/api/me';
import { useTranslations } from 'next-intl';
import { AppContextProvider } from './app-context';
import { NavigationLinks } from './navigation-links';
import { SchoolSwitcher } from './school-selector';
import { NotificationUnreadBadge } from '@/components/notifications/notification-unread-badge';
import { LogoutButton } from '@/components/auth/logout-button';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';

const roleLabelKeys = {
  SUPER_ADMIN: 'roles.superAdmin',
  SCHOOL_ADMIN: 'roles.schoolAdmin',
  TEACHER: 'roles.teacher',
  PARENT: 'roles.parent',
} as const;

export function AppShell({ context, children }: { context: MeResponseDto; children: ReactNode }) {
  const t = useTranslations('shell');
  const foundation = useTranslations('foundation');
  const navigation = useTranslations('navigation');
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
            {!collapsed ? <span className="truncate text-sm font-semibold">{foundation('appName')}</span> : null}
          </div>
          <div className="flex-1 overflow-y-auto py-4"><NavigationLinks role={context.currentSchool.role} platformAuthority={context.platformAuthority} collapsed={collapsed} /></div>
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size={collapsed ? 'icon' : 'default'} className={cn(!collapsed && 'w-full justify-start')} aria-label={collapsed ? t('navigation.expand') : t('navigation.collapse')} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <ChevronsRight className="size-4 rtl:rotate-180" aria-hidden="true" /> : <><ChevronsLeft className="size-4 rtl:rotate-180" aria-hidden="true" /><span>{t('navigation.collapse')}</span></>}
            </Button>
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button className="absolute inset-0 bg-foreground/40" aria-label={t('navigation.close')} onClick={() => setMobileOpen(false)} />
            <aside role="dialog" aria-modal="true" aria-label={navigation('landmark')} className="absolute inset-y-0 start-0 flex h-full w-[min(20rem,85vw)] flex-col bg-card shadow-xl">
              <div className="flex h-[var(--app-topbar-height)] items-center justify-between border-b px-4">
                <span className="font-semibold">{foundation('appName')}</span>
                <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" aria-label={t('navigation.close')} onClick={() => setMobileOpen(false)}><X className="size-5" aria-hidden="true" /></Button>
              </div>
              <div className="overflow-y-auto py-4"><NavigationLinks role={context.currentSchool.role} platformAuthority={context.platformAuthority} onNavigate={() => setMobileOpen(false)} /></div>
              <div className="border-t p-4 sm:hidden"><SchoolSwitcher memberships={context.memberships} currentSchoolId={context.currentSchool.id} /></div>
            </aside>
          </div>
        ) : null}

        <div className={cn('transition-[padding]', collapsed ? 'md:ps-[var(--app-sidebar-collapsed-width)]' : 'md:ps-[var(--app-sidebar-width)]')}>
          <header className="sticky top-0 z-20 flex h-[var(--app-topbar-height)] items-center gap-2 border-b bg-background/95 px-[var(--app-page-padding)] backdrop-blur sm:gap-3">
            <Button ref={mobileTriggerRef} data-testid="mobile-navigation-trigger" type="button" variant="ghost" size="icon" className="md:hidden" aria-label={t('navigation.open')} onClick={() => setMobileOpen(true)}><Menu className="size-5" aria-hidden="true" /></Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{school?.schoolName ?? t('currentSchool')}</p>
              <p className="truncate text-xs text-muted-foreground">{t(roleLabelKeys[context.currentSchool.role])}</p>
            </div>
            <NotificationUnreadBadge />
            <LanguagePreferenceSlot placement="app-shell" />
            <div className="hidden sm:block"><SchoolSwitcher memberships={context.memberships} currentSchoolId={context.currentSchool.id} /></div>
            <LogoutButton variant="ghost" compact />
          </header>
          <main className="min-h-[calc(100vh-var(--app-topbar-height))] p-[var(--app-page-padding)]">{children}</main>
        </div>
      </div>
    </AppContextProvider>
  );
}
