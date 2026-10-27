'use client';
import { useTranslations } from 'next-intl';
import { useAnnouncementCopy } from '@/i18n/use-delivery-copy';
import { formatSchoolInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { Modal, Pagination, SectionHeader } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import type { AnnouncementVersionDto } from '@/lib/frontend/announcements/types';
import { AnnouncementAttachments } from './announcement-attachments';
import { AnnouncementBody } from './announcement-body';
import { AnnouncementForm } from './announcement-form';

export function AnnouncementVersions({
  schoolId,
  announcementId,
  latestVersion,
  editable,
}: {
  schoolId: string;
  announcementId: string;
  latestVersion: AnnouncementVersionDto;
  editable: boolean;
}) {
  const t = useAnnouncementCopy();
  const experience = useTranslations('communicationsExperience');
  const timezone = useAppContext().currentSchool!.timezone;
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...announcementKeys.versions(schoolId, announcementId), 'page', page],
    queryFn: () => announcementsApi.versions(announcementId, page),
  });
  return (
    <section className="cm-versions space-y-4 rounded-lg border bg-card p-5">
      <SectionHeader
        title={t.versionHistory}
        description={t.versionHistoryHint}
        action={
          editable ? (
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>
              {t.newVersion}
            </Button>
          ) : undefined
        }
      />
      {query.isPending ? (
        <InlineLoading label={t.loading} />
      ) : query.isError ? (
        <ApiErrorState onRetry={() => void query.refetch()} />
      ) : (
        <ol className="space-y-3">
          {query.data?.data.map((version) => (
            <li key={version.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">v{version.versionNumber}</span>
                  {version.id === latestVersion.id ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs">{t.current}</span>
                  ) : null}
                </div>
                <time
                  dir="ltr"
                  dateTime={version.createdAt}
                  className="text-xs text-muted-foreground"
                >
                  {formatSchoolInstant(version.createdAt, timezone)}
                </time>
              </div>
              <h3 className="mt-3 font-medium">
                <bdi>{version.title}</bdi>
              </h3>
              <AnnouncementBody body={version.body} bodyFormat={version.bodyFormat} />
              <AnnouncementAttachments
                announcementId={announcementId}
                versionId={version.id}
                versionNumber={version.versionNumber}
              />
            </li>
          ))}
        </ol>
      )}
      {query.data ? <Pagination {...query.data.meta} onPage={setPage} /> : null}
      <Modal
        open={creating}
        title={t.newVersion}
        description={t.versionHistoryHint}
        onClose={() => setCreating(false)}
      >
        {creating ? (
          <>
            <p className="cm-context mb-4">{experience('freshVersion')}</p>
            <AnnouncementForm
              schoolId={schoolId}
              announcementId={announcementId}
              onCancel={() => setCreating(false)}
              onSaved={() => setCreating(false)}
            />
          </>
        ) : null}
      </Modal>
    </section>
  );
}
