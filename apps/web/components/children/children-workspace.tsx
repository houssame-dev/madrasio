'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { ChildCard } from '@/components/parent/child-card';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { parentPortalCopy as t } from '@/lib/frontend/parent-portal/copy';
import { parentBootstrapQuery } from '@/lib/frontend/parent-portal/queries';
import { relatedChildren } from '@/lib/frontend/parent-portal/types';
import { can } from '@/lib/frontend/permissions';

export function ChildrenWorkspace() {
  const context = useAppContext();
  const role = context.currentSchool?.role;
  const schoolId = context.currentSchool?.id;
  const allowed = role === 'PARENT' && !!schoolId && can(role, 'parents.read');
  const profiles = useQuery({ ...parentBootstrapQuery(schoolId ?? 'no-school'), enabled: allowed });
  if (!allowed || !schoolId) return <AccessDeniedWithReturn />;
  if (profiles.isPending) return <InlineLoading label={t.childrenLoading} />;
  if (profiles.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void profiles.refetch()} />;
  if (profiles.data.length === 0) return <EmptyState title={t.noProfile} description={t.noProfileDescription} />;
  const children = relatedChildren(profiles.data);
  if (children.length === 0) return <EmptyState title={t.noChildren} description={t.noChildrenDescription} />;
  return <div className="mx-auto max-w-5xl space-y-6"><header><h1 className="text-2xl font-semibold tracking-tight">{t.myChildren}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.childrenDescription}</p></header><section className="grid gap-4 sm:grid-cols-2" aria-label={t.myChildren}>{children.map((child) => <ChildCard child={child} key={child.id} />)}</section></div>;
}
