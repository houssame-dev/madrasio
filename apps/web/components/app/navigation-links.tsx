'use client';

import { cn } from '@school/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Role } from '@/lib/authorization/roles';
import { copy } from '@/lib/frontend/copy';
import { isActiveNavigationPath, visibleNavigationItems } from '@/lib/frontend/navigation';

export function NavigationLinks({ role, collapsed = false, onNavigate }: { role: Role; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label={copy.navigation} className="grid gap-1 px-2">
      {visibleNavigationItems(role).map((item) => {
        const active = isActiveNavigationPath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              active && 'bg-accent text-accent-foreground',
              collapsed && 'justify-center px-2',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
