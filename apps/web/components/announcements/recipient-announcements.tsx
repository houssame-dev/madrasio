'use client';
import './communications.css';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatSchoolInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { PageContainer } from '@/components/ui/page-container';
import { ApiErrorState, PageLoading } from '@/components/ui/states';
import { Pagination } from '@/components/academic/ui';
import { apiRequest } from '@/lib/frontend/api-client';
import { can } from '@/lib/frontend/permissions';
import type { PageResponse } from '@/lib/frontend/academic/types';
import type { RecipientAnnouncementDto } from '@/lib/frontend/announcements/types';
import { AnnouncementAttachments } from './announcement-attachments';
import { AnnouncementBody } from './announcement-body';

export function RecipientAnnouncements() {
  const text = useDeliveryText();
  const msg = useTranslations();
  const ui = useTranslations('communicationUi');
  const app = useAppContext();
  const school = app.currentSchool;
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = Number(search.get('page') ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
  const allowed = !!school && can(school.role, 'announcements.read');
  const query = useQuery({
    queryKey: ['recipient-announcements', school?.id, app.user.id, page],
    queryFn: () =>
      apiRequest<PageResponse<Omit<RecipientAnnouncementDto, 'body' | 'bodyFormat'>>>(
        `/api/v1/me/announcements?page=${page}&pageSize=20`,
      ),
    enabled: allowed,
  });
  if (!allowed || !school) return <AccessDeniedWithReturn />;
  return (
    <PageContainer variant="READING_CONTENT" className="cm-workspace cm-reading space-y-5">
      {school.role === 'TEACHER' ? (
        <Link
          className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/announcements"
        >
          {msg('announcementUi.back')}
        </Link>
      ) : null}
      <h1 className="text-2xl font-semibold">
        {msg(school.role === 'TEACHER' ? 'announcementUi.inbox' : 'navigation.items.announcements')}
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        {text(
          'Published messages sent to you. Each publication retains its own content and recipient history.',
        )}
      </p>
      <p className="rounded-lg border bg-muted/30 p-3 text-sm">{ui('recipientHelp')}</p>
      {query.isPending ? (
        <PageLoading label={text('Loading announcements…')} />
      ) : query.isError ? (
        <ApiErrorState
          description={text('Announcements could not be loaded.')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {query.data.data.length === 0 ? (
            <p>{text('No published announcements on this page.')}</p>
          ) : (
            <ul className="space-y-3">
              {query.data.data.map((item) => (
                <li key={item.id} className="min-w-0 rounded-lg border bg-card p-4 break-words">
                  <Link
                    className="inline-flex min-h-10 items-center font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/announcements/inbox/${item.id}`}
                  >
                    <bdi>{item.title}</bdi>
                  </Link>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {msg('deliveryUi.publicationCaption', {
                      publication: item.publicationVersion,
                      version: item.versionNumber,
                    })}{' '}
                    ·{' '}
                    <time dir="ltr" dateTime={item.publishedAt}>
                      {formatSchoolInstant(item.publishedAt, school.timezone)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            {...query.data.meta}
            onPage={(next) => router.replace(`${pathname}?page=${next}`)}
          />
        </>
      )}
    </PageContainer>
  );
}

export function RecipientAnnouncement({ publicationId }: { publicationId: string }) {
  const text = useDeliveryText();
  const msg = useTranslations();
  const app = useAppContext();
  const school = app.currentSchool;
  const allowed = !!school && can(school.role, 'announcements.read');
  const query = useQuery({
    queryKey: ['recipient-announcement', school?.id, app.user.id, publicationId],
    queryFn: () =>
      apiRequest<{ data: RecipientAnnouncementDto }>(`/api/v1/me/announcements/${publicationId}`),
    enabled: allowed,
  });
  if (!allowed || !school) return <AccessDeniedWithReturn />;
  const item = query.data?.data;
  return (
    <PageContainer variant="READING_CONTENT" className="cm-workspace cm-reading space-y-5">
      <Link className="underline focus-visible:ring-2" href="/announcements/inbox">
        {msg(school.role === 'TEACHER' ? 'announcementUi.inbox' : 'announcementUi.back')}
      </Link>
      {query.isPending ? (
        <PageLoading label={text('Loading announcement…')} />
      ) : query.isError ? (
        <ApiErrorState
          title={text('Announcement unavailable')}
          description={text('This publication is unavailable for your current access.')}
          onRetry={() => void query.refetch()}
        />
      ) : item ? (
        <article className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-6 break-words">
          <h1 className="text-2xl font-semibold">
            <bdi>{item.title}</bdi>
          </h1>
          <p>
            {msg('deliveryUi.publicationCaption', {
              publication: item.publicationVersion,
              version: item.versionNumber,
            })}{' '}
            ·{' '}
            <time dir="ltr" dateTime={item.publishedAt}>
              {formatSchoolInstant(item.publishedAt, school.timezone)}
            </time>
          </p>
          <AnnouncementBody body={item.body} bodyFormat={item.bodyFormat} />
          <AnnouncementAttachments
            publicationId={publicationId}
            versionNumber={item.versionNumber}
          />
          <p className="text-sm text-muted-foreground">
            {text(
              'This is the content of this exact publication. Later corrections appear as separate publications in your inbox when sent to you.',
            )}
          </p>
        </article>
      ) : null}
    </PageContainer>
  );
}
