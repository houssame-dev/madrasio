'use client';
import { useTranslations } from 'next-intl';

import { useQuery } from '@tanstack/react-query';
import { Bell, UserRoundCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { useTeachingCopy } from '@/i18n/use-people-copy';
import { dashboardKeys, listSelfActiveAssignments, listSelfTeacherProfiles, selfTeacherListParams } from '@/lib/frontend/dashboard/queries';
import { assignmentViews, groupTeacherClasses } from '@/lib/frontend/dashboard/types';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationKeys } from '@/lib/frontend/notifications/queries';
import { teacherKeys } from '@/lib/frontend/teachers/queries';
import { TeacherDailyWorkspace } from './teacher-daily-workspace';

function DashboardEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="rounded-lg border border-dashed bg-card p-8 text-center"><h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</section>;
}

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TeacherOperationalDashboard() {
  const t = useTeachingCopy();
  const ui = useTranslations('peopleUi');

  const app = useAppContext();
  const schoolId = app.currentSchool!.id;
  const profiles = useQuery({
    queryKey: teacherKeys.list(schoolId, selfTeacherListParams),
    queryFn: listSelfTeacherProfiles,
  });
  const profileIds = profiles.data?.map((profile) => profile.id) ?? [];
  const assignments = useQuery({
    queryKey: dashboardKeys.assignments(schoolId, profileIds),
    queryFn: () => listSelfActiveAssignments(profiles.data!),
    enabled: profiles.isSuccess && profileIds.length > 0,
  });
  const hasAssignments = (assignments.data?.length ?? 0) > 0;
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears, enabled: hasAssignments });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId, 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: hasAssignments });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId, 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects'), enabled: hasAssignments });
  const unread = useQuery({ queryKey: notificationKeys.unreadCount(schoolId), queryFn: notificationsApi.unreadCount });

  const retryScope = () => { void profiles.refetch(); if (profiles.data?.length) void assignments.refetch(); };
  if (profiles.isPending || (profileIds.length > 0 && assignments.isPending)) return <InlineLoading label={t.loading} />;
  if (profiles.isError || assignments.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={retryScope} />;

  const school = app.memberships.find((membership) => membership.schoolId === schoolId);
  if (!profiles.data?.length) return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-medium text-muted-foreground"><bdi>{school?.schoolName}</bdi></p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.teacherTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{t.teacherDescription}</p></header><DashboardEmpty title={t.noProfile} description={t.noProfileDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  if (!assignments.data?.length) return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-medium text-muted-foreground"><bdi>{school?.schoolName}</bdi></p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.teacherTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{t.teacherDescription}</p></header><DashboardEmpty title={t.noAssignments} description={t.noAssignmentsDescription} action={<div className="flex flex-wrap justify-center gap-2"><Link className={actionClass} href="/teachers"><UserRoundCheck className="size-4" aria-hidden="true" />{t.viewProfile}</Link><Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link></div>} /></div>;
  if (years.isPending || classes.isPending || subjects.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || subjects.isError) return <ApiErrorState title={t.referencesUnavailable} description={t.referencesUnavailableDescription} onRetry={() => { void years.refetch(); void classes.refetch(); void subjects.refetch(); }} />;

  const views = assignmentViews(assignments.data, years.data, classes.data, subjects.data, {
    academicYear: t.unavailableAcademicYear,
    className: t.unavailableClass,
    subject: t.unavailableSubject,
  });
  const groups = groupTeacherClasses(views);
  const profileLabel = profiles.data.length === 1 ? `${profiles.data[0].firstName} ${profiles.data[0].lastName}` : ui('profileCount', { count: profiles.data.length });
  const unreadCount = unread.data?.count;

  return <TeacherDailyWorkspace views={views} groups={groups} profileLabel={profileLabel} unreadCount={unreadCount} />;
}
