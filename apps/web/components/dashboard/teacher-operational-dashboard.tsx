'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, BookOpen, ClipboardList, GraduationCap, Megaphone, UserRoundCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { localCalendarToday } from '@/lib/frontend/attendance/schemas';
import { dashboardCopy as t } from '@/lib/frontend/dashboard/copy';
import { dashboardKeys, listSelfActiveAssignments, listSelfTeacherProfiles, selfTeacherListParams } from '@/lib/frontend/dashboard/queries';
import { assignmentViews, groupTeacherClasses } from '@/lib/frontend/dashboard/types';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationKeys } from '@/lib/frontend/notifications/queries';
import { teacherKeys } from '@/lib/frontend/teachers/queries';
import { TeacherClassCard } from './teacher-class-card';

function OverviewCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <article className="rounded-lg border bg-card p-4 shadow-sm"><span className="text-muted-foreground" aria-hidden="true">{icon}</span><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></article>;
}

function DashboardEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="rounded-lg border border-dashed bg-card p-8 text-center"><h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</section>;
}

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TeacherOperationalDashboard() {
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
  if (!profiles.data?.length) return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-medium text-muted-foreground">{school?.schoolName}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.teacherTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{t.teacherDescription}</p></header><DashboardEmpty title={t.noProfile} description={t.noProfileDescription} action={<Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link>} /></div>;
  if (!assignments.data?.length) return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-medium text-muted-foreground">{school?.schoolName}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.teacherTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{t.teacherDescription}</p></header><DashboardEmpty title={t.noAssignments} description={t.noAssignmentsDescription} action={<div className="flex flex-wrap justify-center gap-2"><Link className={actionClass} href="/teachers"><UserRoundCheck className="size-4" aria-hidden="true" />{t.viewProfile}</Link><Link className={actionClass} href="/notifications"><Bell className="size-4" aria-hidden="true" />{t.notifications}</Link></div>} /></div>;
  if (years.isPending || classes.isPending || subjects.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || subjects.isError) return <ApiErrorState title={t.referencesUnavailable} description={t.referencesUnavailableDescription} onRetry={() => { void years.refetch(); void classes.refetch(); void subjects.refetch(); }} />;

  const views = assignmentViews(assignments.data, years.data, classes.data, subjects.data, {
    academicYear: t.unavailableAcademicYear,
    className: t.unavailableClass,
    subject: t.unavailableSubject,
  });
  const groups = groupTeacherClasses(views);
  const uniqueSubjects = new Set(views.map((item) => item.subjectId)).size;
  const profileLabel = profiles.data.length === 1 ? `${profiles.data[0].firstName} ${profiles.data[0].lastName}` : `${profiles.data.length} ${t.profiles.toLocaleLowerCase()}`;
  const unreadCount = unread.data?.count;

  return <div className="mx-auto max-w-7xl space-y-8">
    <header><p className="text-sm font-medium text-muted-foreground">{school?.schoolName} · {profileLabel}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.teacherTitle}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t.teacherDescription}</p></header>
    <section aria-label={t.overview} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard icon={<ClipboardList className="size-5" />} label={t.activeAssignments} value={views.length} />
      <OverviewCard icon={<GraduationCap className="size-5" />} label={t.assignedClasses} value={groups.length} />
      <OverviewCard icon={<BookOpen className="size-5" />} label={t.assignedSubjects} value={uniqueSubjects} />
      <OverviewCard icon={<Bell className="size-5" />} label={t.unreadNotifications} value={unread.isError || unreadCount === undefined ? '—' : unreadCount} />
    </section>
    <section className="space-y-4" aria-labelledby="teacher-classes-heading"><div><h2 id="teacher-classes-heading" className="text-xl font-semibold">{t.myClasses}</h2><p className="mt-1 text-sm text-muted-foreground">{t.myClassesDescription}</p></div><div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => <TeacherClassCard key={group.key} group={group} today={localCalendarToday()} />)}</div></section>
    <section className="space-y-4" aria-labelledby="teacher-work-heading"><div><h2 id="teacher-work-heading" className="text-xl font-semibold">{t.myWork}</h2><p className="mt-1 text-sm text-muted-foreground">{t.myWorkDescription}</p></div><div className="grid gap-3 sm:grid-cols-2">
      <Link href="/announcements" className="rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-2 font-medium"><Megaphone className="size-4" aria-hidden="true" />{t.announcements}</span><span className="mt-2 block text-sm text-muted-foreground">{t.announcementsDescription}</span></Link>
      <Link href="/notifications" className="rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-2 font-medium"><Bell className="size-4" aria-hidden="true" />{t.notifications}</span><span className="mt-2 block text-sm text-muted-foreground">{t.notificationDescription(unreadCount)}</span></Link>
    </div></section>
  </div>;
}
