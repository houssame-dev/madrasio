'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { StatusBadge } from '@/components/academic/ui';
import { ApiErrorState, PageLoading } from '@/components/ui/states';
import { allAnnouncementPublications, announcementsApi, currentUserAnnouncementAssignments } from '@/lib/frontend/announcements/api';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementErrorMessage } from '@/lib/frontend/announcements/errors';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto } from '@/lib/frontend/academic/types';
import { can } from '@/lib/frontend/permissions';
import { AnnouncementVersions } from './announcement-versions';
import { AnnouncementTargets } from './announcement-targets';
import { AnnouncementPublicationActions } from './announcement-publication-actions';
import { AnnouncementPublications } from './announcement-publications';

export function AnnouncementDetailWorkspace({ announcementId }: { announcementId: string }) {
  const app = useAppContext(); const schoolId = app.currentSchool?.id; const role = app.currentSchool?.role; const allowed = !!schoolId && !!role && role !== 'PARENT' && can(role, 'announcements.read');
  const detail = useQuery({ queryKey: announcementKeys.detail(schoolId ?? 'no-school', announcementId), queryFn: () => announcementsApi.detail(announcementId), enabled: allowed });
  const versions = useQuery({ queryKey: announcementKeys.versions(schoolId ?? 'no-school', announcementId), queryFn: () => announcementsApi.versions(announcementId), enabled: allowed });
  const publications = useQuery({ queryKey: [...announcementKeys.publications(schoolId ?? 'no-school', announcementId), 'all'], queryFn: () => allAnnouncementPublications(announcementId), enabled: allowed });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'years'), queryFn: academicApi.allYears, enabled: allowed });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: allowed });
  const scope = useQuery({ queryKey: announcementKeys.authorScope(schoolId ?? 'no-school', app.user.id), queryFn: () => currentUserAnnouncementAssignments(app.user.id), enabled: allowed && role === 'TEACHER' });
  if (!allowed || !schoolId || !role) return <AccessDeniedWithReturn />; if (detail.isPending || versions.isPending || publications.isPending || years.isPending || classes.isPending || (role === 'TEACHER' && scope.isPending)) return <PageLoading label={t.loading} />; if (detail.isError) return <ApiErrorState title={t.unavailable} description={announcementErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />; if (!detail.data) return null;
  const value = detail.data; const canManage = can(role, 'announcements.create'); const canPublish = can(role, 'announcements.publish'); const versionPublished = publications.data?.some((item) => item.announcementVersionId === value.latestVersion.id) ?? false; const targetsEditable = canManage && value.announcement.status !== 'ARCHIVED' && !versionPublished; const teacherClassIds = role === 'TEACHER' ? new Set((scope.data ?? []).filter((item) => item.status === 'ACTIVE').map((item) => item.classId)) : undefined;
  return <div className="mx-auto max-w-6xl space-y-6"><Link className="text-sm font-medium text-primary hover:underline" href="/announcements">← {t.back}</Link><header className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">v{value.latestVersion.versionNumber} · {t.current}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{value.latestVersion.title}</h1></div><StatusBadge status={value.announcement.status} /></div><p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6">{value.latestVersion.body}</p><p className="mt-4 text-xs text-muted-foreground">{t.plainText}</p></header><AnnouncementTargets schoolId={schoolId} announcementId={announcementId} version={value.latestVersion} years={years.data ?? []} classes={classes.data ?? []} teacherClassIds={teacherClassIds} editable={targetsEditable} /><AnnouncementPublicationActions schoolId={schoolId} detail={value} canPublish={canPublish} canManage={canManage} currentVersionPublished={versionPublished} /><AnnouncementVersions schoolId={schoolId} announcementId={announcementId} latestVersion={value.latestVersion} editable={canManage && value.announcement.status !== 'ARCHIVED'} /><AnnouncementPublications schoolId={schoolId} announcementId={announcementId} versions={versions.data?.data ?? []} /></div>;
}
