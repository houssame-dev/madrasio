'use client';
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
  const app = useAppContext(); const school = app.currentSchool;
  const search = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const raw = Number(search.get('page') ?? 1); const page = Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
  const allowed = !!school && can(school.role, 'announcements.read');
  const query = useQuery({ queryKey: ['recipient-announcements', school?.id, app.user.id, page],
    queryFn: () => apiRequest<PageResponse<Omit<RecipientAnnouncementDto, 'body' | 'bodyFormat'>>>(`/api/v1/me/announcements?page=${page}&pageSize=20`), enabled: allowed });
  if (!allowed || !school) return <AccessDeniedWithReturn />;
  return <PageContainer variant="READING_CONTENT" className="space-y-5">
    <h1 className="text-2xl font-semibold">{text("School announcements")}</h1>
    <p>{text("Published messages sent to you. Each publication retains its own content and recipient history.")}</p>
    {query.isPending ? <PageLoading label={text("Loading announcements…")} /> : query.isError ? <ApiErrorState description={text("Announcements could not be loaded.")} onRetry={() => void query.refetch()} /> : <>
      {query.data.data.length === 0 ? <p>{text("No published announcements on this page.")}</p> : <ul className="space-y-3">{query.data.data.map((item) => <li key={item.id} className="rounded-lg border p-4">
        <Link className="font-semibold underline focus-visible:ring-2" href={`/announcements/inbox/${item.id}`}><bdi>{item.title}</bdi></Link>
        <p className="text-sm">{msg('deliveryUi.publicationCaption', { publication: item.publicationVersion, version: item.versionNumber })} · <time dir="ltr" dateTime={item.publishedAt}>{formatSchoolInstant(item.publishedAt, school.timezone)}</time></p>
      </li>)}</ul>}
      <Pagination {...query.data.meta} onPage={(next) => router.replace(`${pathname}?page=${next}`)} />
    </>}
  </PageContainer>;
}

export function RecipientAnnouncement({ publicationId }: { publicationId: string }) {
  const text = useDeliveryText();
  const msg = useTranslations();
  const app = useAppContext(); const school = app.currentSchool;
  const allowed = !!school && can(school.role, 'announcements.read');
  const query = useQuery({ queryKey: ['recipient-announcement', school?.id, app.user.id, publicationId],
    queryFn: () => apiRequest<{ data: RecipientAnnouncementDto }>(`/api/v1/me/announcements/${publicationId}`), enabled: allowed });
  if (!allowed || !school) return <AccessDeniedWithReturn />;
  const item = query.data?.data;
  return <PageContainer variant="READING_CONTENT" className="space-y-5">
    <Link className="underline focus-visible:ring-2" href="/announcements/inbox">{text("Back to School announcements")}</Link>
    {query.isPending ? <PageLoading label={text("Loading announcement…")} /> : query.isError ? <ApiErrorState title={text("Announcement unavailable")} description={text("This publication is unavailable for your current access.")} onRetry={() => void query.refetch()} /> : item ? <article className="space-y-4">
      <h1 className="text-2xl font-semibold"><bdi>{item.title}</bdi></h1>
      <p>{msg('deliveryUi.publicationCaption', { publication: item.publicationVersion, version: item.versionNumber })} · <time dir="ltr" dateTime={item.publishedAt}>{formatSchoolInstant(item.publishedAt, school.timezone)}</time></p>
      <AnnouncementBody body={item.body} bodyFormat={item.bodyFormat} />
      <AnnouncementAttachments publicationId={publicationId} />
      <p className="text-sm text-muted-foreground">{text("This is the content of this exact publication. Later corrections appear as separate publications in your inbox when sent to you.")}</p>
    </article> : null}
  </PageContainer>;
}
