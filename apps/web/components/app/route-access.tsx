'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Permission } from '@/lib/authorization/permissions';
import type { Role } from '@/lib/authorization/roles';
import { copy } from '@/lib/frontend/copy';
import { can } from '@/lib/frontend/permissions';
import { AccessDeniedState } from '@/components/ui/states';
import { useAppContext } from './app-context';

export function RouteAccess({ permission, roles, children }: { permission?: Permission; roles?: readonly Role[]; children: ReactNode }) {
  const context = useAppContext();
  const role = context.currentSchool?.role;
  const allowed = role != null && (!permission || can(role, permission)) && (!roles || roles.includes(role));

  if (!allowed) {
    return <AccessDeniedWithReturn />;
  }
  return <>{children}</>;
}

export function AccessDeniedWithReturn() {
  return (
    <AccessDeniedState action={<Link href="/dashboard" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{copy.backToDashboard}</Link>} />
  );
}
