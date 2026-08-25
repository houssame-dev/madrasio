'use client';

import Link from 'next/link';
import type { Permission } from '@/lib/authorization/permissions';
import { copy } from '@/lib/frontend/copy';
import type { Role } from '@/lib/authorization/roles';
import { RouteAccess } from './route-access';

export function FeaturePlaceholder({ title, permission, roles }: { title: string; permission: Permission; roles?: readonly Role[] }) {
  return (
    <RouteAccess permission={permission} roles={roles}>
      <section className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{copy.productName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{copy.comingSoon}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">{copy.backToDashboard}</Link>
        </div>
      </section>
    </RouteAccess>
  );
}
