'use client';
import { formatSchoolInstant } from '@school/shared';
import { Button } from '@school/ui';
import { useAppContext } from '@/components/app/app-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog, InlineFeedback, Pagination, SectionHeader, StatusBadge, TableShell, EmptyTableRow } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import { announcementErrorMessage } from '@/lib/frontend/announcements/errors';
import type { AnnouncementPublicationDto, AnnouncementVersionDto } from '@/lib/frontend/announcements/types';
import { AnnouncementScheduleDialog } from './announcement-schedule-dialog';

export function AnnouncementPublications({ schoolId, announcementId, versions, canPublish = false }: {
  schoolId: string; announcementId: string; versions: AnnouncementVersionDto[]; canPublish?: boolean;
}) {
  const timezone = useAppContext().currentSchool!.timezone;
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [cancel, setCancel] = useState<AnnouncementPublicationDto | null>(null);
  const [reschedule, setReschedule] = useState<AnnouncementPublicationDto | null>(null);
  const [feedback, setFeedback] = useState('');
  const query = useQuery({ queryKey: [...announcementKeys.publications(schoolId, announcementId), 'page', page], queryFn: () => announcementsApi.publications(announcementId, page) });
  const mutation = useMutation({ mutationFn: (id: string) => announcementsApi.cancel(announcementId, id),
    onSuccess: async () => { await invalidateAnnouncement(client, schoolId, announcementId, { list: true, publications: true }); setCancel(null); setFeedback('Scheduled publication cancelled. No recipients were notified.'); } });
  const versionNumber = (id: string) => versions.find((item) => item.id === id)?.versionNumber;
  return <section className="space-y-4 rounded-lg border bg-card p-5">
    <SectionHeader title={t.publications} description={t.publicationsHint} />
    {feedback ? <InlineFeedback kind="success">{feedback}</InlineFeedback> : null}
    {query.isError ? <ApiErrorState description={announcementErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : <TableShell headers={[t.publication, t.version, t.status, t.scheduledAt, t.publishedAt, t.recipients, t.actions]} loading={query.isPending}>
      {query.data?.data.length === 0 ? <EmptyTableRow columns={7} /> : query.data?.data.map((item) => <tr key={item.id}>
        <td className="px-4 py-3">#{item.publicationVersion}</td><td className="px-4 py-3">v{item.versionNumber ?? versionNumber(item.announcementVersionId) ?? '?'}</td>
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
        <td className="px-4 py-3">{item.scheduledAt ? formatSchoolInstant(item.scheduledAt, timezone) : '—'}</td>
        <td className="px-4 py-3">{item.publishedAt ? formatSchoolInstant(item.publishedAt, timezone) : '—'}</td>
        <td className="px-4 py-3">{item.recipientCount}</td><td className="px-4 py-3">{canPublish && item.status === 'SCHEDULED' ? <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => { setFeedback(''); setReschedule(item); }}>Reschedule #{item.publicationVersion}</Button>
          <Button type="button" variant="outline" onClick={() => { mutation.reset(); setFeedback(''); setCancel(item); }}>Cancel publication #{item.publicationVersion}</Button>
        </div> : '—'}</td>
      </tr>)}
    </TableShell>}
    {query.data ? <Pagination {...query.data.meta} onPage={setPage} /> : null}
    <p className="text-xs text-muted-foreground">{t.scheduledBoundary}</p>
    <ConfirmDialog open={!!cancel} title="Cancel scheduled publication?" description="This intent stays in history as CANCELLED. If publication already won the race, cancellation will be refused. To correct content or targets, create a new Version afterward."
      pending={mutation.isPending} error={mutation.isError ? announcementErrorMessage(mutation.error) : undefined}
      onClose={() => { if (!mutation.isPending) setCancel(null); }} onConfirm={() => { if (cancel && !mutation.isPending) mutation.mutate(cancel.id); }} />
    {reschedule ? <AnnouncementScheduleDialog open schoolId={schoolId} announcementId={announcementId} versionId={reschedule.announcementVersionId} publicationId={reschedule.id}
      onClose={() => setReschedule(null)} /> : null}
  </section>;
}
