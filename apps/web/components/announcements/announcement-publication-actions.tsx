'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog, InlineFeedback, SectionHeader } from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementErrorMessage } from '@/lib/frontend/announcements/errors';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import type { AnnouncementDetailDto } from '@/lib/frontend/announcements/types';
import { AnnouncementScheduleDialog } from './announcement-schedule-dialog';

export function AnnouncementPublicationActions({ schoolId, detail, canPublish, canManage, currentVersionPublished }: { schoolId: string; detail: AnnouncementDetailDto; canPublish: boolean; canManage: boolean; currentVersionPublished: boolean }) {
  const queryClient = useQueryClient(); const [confirming, setConfirming] = useState<'publish' | 'archive'>(); const [scheduling, setScheduling] = useState(false); const [notice, setNotice] = useState<string>();
  const id = detail.announcement.id; const versionId = detail.latestVersion.id;
  const publish = useMutation({ mutationFn: () => announcementsApi.publish(id, versionId), onSuccess: async () => { await invalidateAnnouncement(queryClient, schoolId, id, { list: true, publications: true }); setNotice(t.publishedSuccess); setConfirming(undefined); }, onError: (error) => setNotice(announcementErrorMessage(error)) });
  const archive = useMutation({ mutationFn: () => announcementsApi.archive(id), onSuccess: async () => { await invalidateAnnouncement(queryClient, schoolId, id, { list: true }); setConfirming(undefined); }, onError: (error) => setNotice(announcementErrorMessage(error)) });
  const publishable = canPublish && detail.announcement.status !== 'ARCHIVED' && !currentVersionPublished;
  return <section className="space-y-4 rounded-lg border bg-card p-5"><SectionHeader title="Publication actions" description="Publication always references the exact current Version shown above." />{notice ? <InlineFeedback kind={notice === t.publishedSuccess ? 'success' : 'error'}>{notice}</InlineFeedback> : null}<div className="flex flex-wrap gap-2">{publishable ? <><Button type="button" onClick={() => { setNotice(undefined); setConfirming('publish'); }}>{t.publishNow}</Button><Button type="button" variant="outline" onClick={() => { setNotice(undefined); setScheduling(true); }}>{t.schedule}</Button></> : null}{canManage && detail.announcement.status !== 'ARCHIVED' ? <Button type="button" variant="outline" onClick={() => { setNotice(undefined); setConfirming('archive'); }}>{t.archive}</Button> : null}</div>{detail.announcement.status === 'SCHEDULED' ? <div className="space-y-1 text-sm text-muted-foreground"><p>{t.scheduledBoundary}</p><p>{t.noCancel}</p></div> : null}<ConfirmDialog open={confirming === 'publish'} title={t.publishTitle} description={t.publishDescription} pending={publish.isPending} error={publish.isError ? announcementErrorMessage(publish.error) : undefined} onClose={() => setConfirming(undefined)} onConfirm={() => publish.mutate()} /><ConfirmDialog open={confirming === 'archive'} title={t.archiveTitle} description={t.archiveDescription} pending={archive.isPending} error={archive.isError ? announcementErrorMessage(archive.error) : undefined} onClose={() => setConfirming(undefined)} onConfirm={() => archive.mutate()} /><AnnouncementScheduleDialog open={scheduling} schoolId={schoolId} announcementId={id} versionId={versionId} onClose={() => setScheduling(false)} /></section>;
}
