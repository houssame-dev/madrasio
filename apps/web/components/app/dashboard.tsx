'use client';

import { Building2, ShieldCheck } from 'lucide-react';

import { useTranslations } from 'next-intl';

import { TeacherOperationalDashboard } from '@/components/dashboard/teacher-operational-dashboard';
import { ParentDashboard } from '@/components/parent/parent-dashboard';
import { useAppContext } from './app-context';

const roleKeys = { SUPER_ADMIN: 'roles.superAdmin', SCHOOL_ADMIN: 'roles.schoolAdmin', TEACHER: 'roles.teacher', PARENT: 'roles.parent' } as const;

export function Dashboard() {
  const t = useTranslations('workspace');
  const shell = useTranslations('shell');
  const context = useAppContext();
  const current = context.currentSchool;
  const school = context.memberships.find((membership) => membership.schoolId === current?.id);
  if (!current) return null;
  if (current.role === 'TEACHER') return <TeacherOperationalDashboard />;
  if (current.role === 'PARENT') return <ParentDashboard />;

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground"><bdi>{school?.schoolName}</bdi></p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('dashboardHeading')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('dashboardDescription')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <Building2 className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{shell('currentSchool')}</p>
          <p className="mt-1 font-semibold"><bdi>{school?.schoolName}</bdi></p>
        </article>
        <article className="rounded-lg border bg-card p-5 shadow-sm">
          <ShieldCheck className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('currentRole')}</p>
          <p className="mt-1 font-semibold">{shell(roleKeys[current.role])}</p>
        </article>
      </div>
      <article className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">{t('foundationReady')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('foundationReadyDescription')}</p>
      </article>
    </section>
  );
}
