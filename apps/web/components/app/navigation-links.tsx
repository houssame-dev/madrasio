'use client';

import { cn } from '@school/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Role } from '@/lib/authorization/roles';
import { isActiveNavigationPath, visibleNavigationItems } from '@/lib/frontend/navigation';

export function NavigationLinks({ role, platformAuthority, collapsed = false, onNavigate }: { role: Role; platformAuthority?: 'SUPER_ADMIN'; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations('navigation');
  const itemLabel = useTranslations('navigation.items');

  return (
    <nav aria-label={t('landmark')} className="grid gap-1.5 px-3">
      {platformAuthority === 'SUPER_ADMIN' && role !== 'SCHOOL_ADMIN' ? <Link href="/platform/schools" className="px-3 py-2 text-sm underline" onClick={onNavigate}>{itemLabel('platformSchools')}</Link> : null}
      {visibleNavigationItems(role).map((item) => {
        const active = isActiveNavigationPath(pathname, item.href);
        const Icon = item.icon;
        const label = itemLabel(item.labelKey);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:ring-inset motion-reduce:transition-none',
              active && 'border-primary/20 bg-accent font-semibold text-accent-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
