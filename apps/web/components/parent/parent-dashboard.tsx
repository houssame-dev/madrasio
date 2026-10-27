'use client';

import { ParentDailyWorkspace } from './parent-daily-workspace';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { useParentPortalCopy } from '@/i18n/use-people-copy';
import { parentBootstrapQuery } from '@/lib/frontend/parent-portal/queries';
import { relatedChildren } from '@/lib/frontend/parent-portal/types';

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ParentDashboard() {
  const t = useParentPortalCopy();

  const context = useAppContext();
  const schoolId = context.currentSchool!.id;
  const school = context.memberships.find((membership) => membership.schoolId === schoolId);
  const profiles = useQuery(parentBootstrapQuery(schoolId));
  if (profiles.isPending) return <InlineLoading label={t.loading} />;
  if (profiles.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void profiles.refetch()} />;
  const children = relatedChildren(profiles.data);
  const header = <header><p className="text-sm font-medium text-muted-foreground"><bdi>{school?.schoolName}</bdi></p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.dashboardTitle}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t.dashboardDescription}</p></header>;
  if (profiles.data.length === 0) return <div className="mx-auto max-w-7xl space-y-6">{header}<EmptyState title={t.noProfile} description={t.noProfileDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  if (children.length === 0) return <div className="mx-auto max-w-7xl space-y-6">{header}<EmptyState title={t.noChildren} description={t.noChildrenDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  return <ParentDailyWorkspace key={`${schoolId}:${context.user.id}:${children.map(c => c.id).join(':')}`} linkedChildren={children} />;
}
