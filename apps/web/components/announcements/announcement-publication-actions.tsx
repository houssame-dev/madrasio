'use client';
import { useAnnouncementCopy } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog, InlineFeedback, Modal, SectionHeader } from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementErrorMessage } from '@/lib/frontend/announcements/errors';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import type { AnnouncementDetailDto } from '@/lib/frontend/announcements/types';
import { useTranslations } from 'next-intl';
import { useAppContext } from '@/components/app/app-context';
import { apiRequest } from '@/lib/frontend/api-client';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { AnnouncementBody } from './announcement-body';
import { AnnouncementScheduleDialog } from './announcement-schedule-dialog';

export function AnnouncementPublicationActions({
  schoolId,
  detail,
  canPublish,
  canManage,
  currentVersionPublished,
  years = [],
  classes = [],
}: {
  schoolId: string;
  detail: AnnouncementDetailDto;
  canPublish: boolean;
  canManage: boolean;
  currentVersionPublished: boolean;
  years?: AcademicYearDto[];
  classes?: ClassDto[];
}) {
  const t = useAnnouncementCopy();
  const experience = useTranslations('communicationsExperience');
  const common = useTranslations('collection');
  const actions = useTranslations('foundation.actions');
  const app = useAppContext();
  const text = useDeliveryText();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'publish' | 'archive'>();
  const [scheduling, setScheduling] = useState(false);
  const [notice, setNotice] = useState<string>();
  const id = detail.announcement.id;
  const versionId = detail.latestVersion.id;
  const publish = useMutation({
    mutationFn: () => announcementsApi.publish(id, versionId),
    onSuccess: async () => {
      await invalidateAnnouncement(queryClient, schoolId, id, { list: true, publications: true });
      setNotice(t.publishedSuccess);
      setConfirming(undefined);
    },
    onError: (error) => setNotice(text(announcementErrorMessage(error))),
  });
  const archive = useMutation({
    mutationFn: () => announcementsApi.archive(id),
    onSuccess: async () => {
      await invalidateAnnouncement(queryClient, schoolId, id, { list: true });
      setConfirming(undefined);
    },
    onError: (error) => setNotice(text(announcementErrorMessage(error))),
  });
  const publishable =
    canPublish && detail.announcement.status !== 'ARCHIVED' && !currentVersionPublished;
  const targets = useQuery({
    queryKey: announcementKeys.targets(schoolId, id, versionId),
    queryFn: () => announcementsApi.targets(id, versionId),
    enabled: publishable,
  });
  const path = `/api/v1/announcements/${id}/versions/${versionId}/attachments` as const;
  const files = useQuery({
    queryKey: ['announcement-attachments', schoolId, app.user.id, path],
    queryFn: () => apiRequest<{ data: { id: string; name: string; state: string }[] }>(path),
    enabled: publishable,
  });
  const ready =
    targets.isSuccess &&
    files.isSuccess &&
    targets.data.length > 0 &&
    files.data.data.every((file) => file.state === 'READY');
  const review = (
    <div className="cm-review">
      <section>
        <h3>
          {experience('review')} · <bdi>v{detail.latestVersion.versionNumber}</bdi>
        </h3>
        <p className="mt-2 font-semibold" dir="auto">
          {detail.latestVersion.title}
        </p>
        <div className="cm-preview">
          <AnnouncementBody
            body={detail.latestVersion.body}
            bodyFormat={detail.latestVersion.bodyFormat}
          />
        </div>
      </section>
      <section>
        <h3>{t.targets}</h3>
        <ul>
          {targets.data?.map((target) => (
            <li key={target.id}>
              {text(target.audience)} · {text(target.targetType)} ·{' '}
              <bdi>
                {years.find((year) => year.id === target.academicYearId)?.name ?? t.academicYear}
              </bdi>
              {target.classId ? (
                <>
                  {' '}
                  · <bdi>{classes.find((item) => item.id === target.classId)?.name ?? t.class}</bdi>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {targets.isSuccess && !targets.data.length ? <p>{t.noTargets}</p> : null}
      </section>
      <section>
        <h3>{text('Attachments')}</h3>
        <ul>
          {files.data?.data
            .filter((file) => file.state === 'READY')
            .map((file) => (
              <li key={file.id}>
                <bdi>{file.name}</bdi> · {text('READY')}
              </li>
            ))}
        </ul>
        {files.isSuccess && !files.data.data.length ? (
          <p>{text('No attachments for this Version.')}</p>
        ) : null}
      </section>
      {!ready ? (
        <InlineFeedback brand kind="error">
          {experience('readiness')}
          {targets.isError || files.isError ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void targets.refetch();
                void files.refetch();
              }}
            >
              {text('Retry')}
            </Button>
          ) : null}
        </InlineFeedback>
      ) : null}
    </div>
  );
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <SectionHeader
        title={text('Publication actions')}
        description={text('Publication always references the exact current Version shown above.')}
      />
      {notice ? (
        <InlineFeedback brand kind={notice === t.publishedSuccess ? 'success' : 'error'}>
          {text(notice)}
        </InlineFeedback>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {publishable ? (
          <>
            <Button
              className="cm-primary"
              type="button"
              onClick={() => {
                setNotice(undefined);
                setConfirming('publish');
              }}
            >
              {t.publishNow}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNotice(undefined);
                setScheduling(true);
              }}
            >
              {t.schedule}
            </Button>
          </>
        ) : null}
        {canManage && detail.announcement.status !== 'ARCHIVED' ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNotice(undefined);
              setConfirming('archive');
            }}
          >
            {t.archive}
          </Button>
        ) : null}
      </div>
      {detail.announcement.status === 'SCHEDULED' ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t.scheduledBoundary}</p>
          <p>{t.noCancel}</p>
        </div>
      ) : null}
      <Modal
        open={confirming === 'publish'}
        title={t.publishTitle}
        description={t.publishDescription}
        onClose={() => {
          if (!publish.isPending) setConfirming(undefined);
        }}
      >
        <div className="cm-workspace space-y-4">
          {review}

          {publish.isError ? (
            <InlineFeedback brand kind="error">
              {text(announcementErrorMessage(publish.error))}
            </InlineFeedback>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              disabled={publish.isPending}
              onClick={() => setConfirming(undefined)}
            >
              {actions('cancel')}
            </Button>
            <Button
              className="cm-primary"
              type="button"
              disabled={publish.isPending || !ready}
              onClick={() => {
                if (!publish.isPending && ready) publish.mutate();
              }}
            >
              {common('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming === 'archive'}
        title={t.archiveTitle}
        description={t.archiveDescription}
        pending={archive.isPending}
        error={archive.isError ? text(announcementErrorMessage(archive.error)) : undefined}
        onClose={() => {
          if (!archive.isPending) setConfirming(undefined);
        }}
        onConfirm={() => {
          if (!archive.isPending) archive.mutate();
        }}
      />
      <AnnouncementScheduleDialog
        open={scheduling}
        schoolId={schoolId}
        announcementId={id}
        versionId={versionId}
        review={review}
        blocked={!ready}
        onClose={() => setScheduling(false)}
      />
    </section>
  );
}
