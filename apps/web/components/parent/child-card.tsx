'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useParentPortalCopy } from '@/i18n/use-people-copy';
import { childHref, type ParentChildView } from '@/lib/frontend/parent-portal/types';

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ChildCard({ child, showResults = false }: { child: ParentChildView; showResults?: boolean }) {
  const t = useParentPortalCopy();
  const ui = useTranslations('dashboardUi');

  const name = `${child.firstName} ${child.lastName}`;
  const headingId = `parent-child-${child.id}`;
  return <article className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby={headingId}>
    <div className="flex items-start gap-3"><span className="rounded-full bg-muted p-2 text-muted-foreground" aria-hidden="true"><GraduationCap className="size-5" /></span><div><h3 id={headingId} className="font-semibold"><bdi>{name}</bdi></h3><p className="mt-1 text-sm text-muted-foreground">{t.studentCode}: <bdi>{child.studentCode ?? t.unknown}</bdi></p></div></div>
    <div className="mt-4 flex flex-wrap gap-2"><Link href={childHref(child.id)} className={actionClass} aria-label={t.viewChild(name)}>{t.viewChild(name)}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" /></Link>{showResults ? <Link href={`${childHref(child.id)}#results`} className={actionClass}>{ui('childResults', { name })}</Link> : null}</div>
  </article>;
}
