'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAppContext } from '@/components/app/app-context';
import { ChildCard } from '@/components/parent/child-card';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationKeys } from '@/lib/frontend/notifications/queries';
import { parentPortalCopy as t } from '@/lib/frontend/parent-portal/copy';
import { parentBootstrapQuery } from '@/lib/frontend/parent-portal/queries';
import { relatedChildren } from '@/lib/frontend/parent-portal/types';

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function CountCard({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return <article className="rounded-lg border bg-card p-4 shadow-sm"><span className="text-muted-foreground" aria-hidden="true">{icon}</span><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></article>;
}

export function ParentDashboard() {
  const context = useAppContext();
  const schoolId = context.currentSchool!.id;
  const school = context.memberships.find((membership) => membership.schoolId === schoolId);
  const profiles = useQuery(parentBootstrapQuery(schoolId));
  const unread = useQuery({ queryKey: notificationKeys.unreadCount(schoolId), queryFn: notificationsApi.unreadCount });
  if (profiles.isPending) return <InlineLoading label={t.loading} />;
  if (profiles.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void profiles.refetch()} />;
  const children = relatedChildren(profiles.data);
  const header = <header><p className="text-sm font-medium text-muted-foreground">{school?.schoolName}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.dashboardTitle}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t.dashboardDescription}</p></header>;
  if (profiles.data.length === 0) return <div className="mx-auto max-w-7xl space-y-6">{header}<EmptyState title={t.noProfile} description={t.noProfileDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  if (children.length === 0) return <div className="mx-auto max-w-7xl space-y-6">{header}<EmptyState title={t.noChildren} description={t.noChildrenDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  const unreadCount = unread.data?.count;
  return <div className="mx-auto max-w-7xl space-y-8">{header}
    <section className="grid gap-3 sm:grid-cols-2" aria-label={t.dashboardOverview}><CountCard label={t.relatedChildren} value={children.length} icon={<GraduationCap className="size-5" />} /><CountCard label={t.unreadNotifications} value={unread.isError || unreadCount === undefined ? '—' : unreadCount} icon={<Bell className="size-5" />} /></section>
    <section className="space-y-4" aria-labelledby="parent-dashboard-children"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="parent-dashboard-children" className="text-xl font-semibold">{t.myChildren}</h2><p className="mt-1 text-sm text-muted-foreground">{t.childrenDescription}</p></div><Link className={actionClass} href="/children">{t.viewAllChildren}</Link></div><div className="grid gap-4 sm:grid-cols-2">{children.map((child) => <ChildCard child={child} key={child.id} />)}</div></section>
    <Link href="/notifications" className="block rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-2 font-medium"><Bell className="size-4" aria-hidden="true" />{t.notifications}</span><span className="mt-2 block text-sm text-muted-foreground">{t.notificationsDescription(unreadCount)}</span></Link>
  </div>;
}
