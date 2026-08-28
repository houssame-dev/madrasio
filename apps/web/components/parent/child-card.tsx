import { ArrowRight, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { parentPortalCopy as t } from '@/lib/frontend/parent-portal/copy';
import { childHref, type ParentChildView } from '@/lib/frontend/parent-portal/types';

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ChildCard({ child }: { child: ParentChildView }) {
  const name = `${child.firstName} ${child.lastName}`;
  const headingId = `parent-child-${child.id}`;
  return <article className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby={headingId}>
    <div className="flex items-start gap-3"><span className="rounded-full bg-muted p-2 text-muted-foreground" aria-hidden="true"><GraduationCap className="size-5" /></span><div><h3 id={headingId} className="font-semibold">{name}</h3><p className="mt-1 text-sm text-muted-foreground">{t.studentCode}: {child.studentCode ?? t.unknown}</p></div></div>
    <div className="mt-4"><Link href={childHref(child.id)} className={actionClass} aria-label={t.viewChild(name)}>{t.viewChild(name)}<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
  </article>;
}
