'use client';

import { Building2, ShieldCheck } from 'lucide-react';

import { copy, roleLabels } from '@/lib/frontend/copy';
import { useAppContext } from './app-context';

export function Dashboard() {
  const context = useAppContext();
  const current = context.currentSchool;
  const school = context.memberships.find((membership) => membership.schoolId === current?.id);
  if (!current) return null;

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{school?.schoolName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{copy.dashboardHeading}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{copy.dashboardDescription}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <Building2 className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.currentSchool}</p>
          <p className="mt-1 font-semibold">{school?.schoolName}</p>
        </article>
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <ShieldCheck className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.currentRole}</p>
          <p className="mt-1 font-semibold">{roleLabels[current.role]}</p>
        </article>
      </div>
      <article className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">{copy.foundationReady}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.foundationReadyDescription}</p>
      </article>
    </section>
  );
}
