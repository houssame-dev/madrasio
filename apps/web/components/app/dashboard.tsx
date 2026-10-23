'use client';

import { useTranslations } from 'next-intl';
import { TeacherOperationalDashboard } from '@/components/dashboard/teacher-operational-dashboard';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { ParentDashboard } from '@/components/parent/parent-dashboard';
import { useAppContext } from './app-context';

export function Dashboard() {
  const t = useTranslations('workspace');
  const ui = useTranslations('dashboardUi');
  const shell = useTranslations('shell');
  const context = useAppContext();
  const current = context.currentSchool;
  const school = context.memberships.find((membership) => membership.schoolId === current?.id);
  if (!current) return null;
  if (current.role === 'TEACHER') return <TeacherOperationalDashboard />;
  if (current.role === 'PARENT') return <ParentDashboard />;

  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="space-y-3 border-b pb-6">
      <p className="text-sm font-medium text-muted-foreground"><bdi>{school?.schoolName ?? shell('currentSchool')}</bdi></p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('dashboardHeading')}</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{ui('adminIntro')}</p>
      <p className="text-sm">{shell(current.role === 'SCHOOL_ADMIN' ? 'roles.schoolAdmin' : 'roles.superAdmin')}<span aria-hidden="true"> · </span>{ui('schoolTimeZone')}: <bdi>{current.timezone}</bdi></p>
    </header>
    <DashboardActions workflows="school" />
  </div>;
}
