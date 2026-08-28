'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination, SectionHeader, StatusBadge, TableShell, EmptyTableRow } from '@/components/academic/ui';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import type { AnnouncementVersionDto } from '@/lib/frontend/announcements/types';

export function AnnouncementPublications({ schoolId, announcementId, versions }: { schoolId: string; announcementId: string; versions: AnnouncementVersionDto[] }) {
  const [page, setPage] = useState(1); const query = useQuery({ queryKey: [...announcementKeys.publications(schoolId, announcementId), 'page', page], queryFn: () => announcementsApi.publications(announcementId, page) }); const versionNumber = (id: string) => versions.find((item) => item.id === id)?.versionNumber;
  return <section className="space-y-4 rounded-lg border bg-card p-5"><SectionHeader title={t.publications} description={t.publicationsHint} /><TableShell headers={[t.publication, t.version, t.status, t.scheduledAt, t.publishedAt, t.recipients]} loading={query.isPending}>{query.data?.data.length === 0 ? <EmptyTableRow columns={6} /> : query.data?.data.map((item) => <tr key={item.id}><td className="px-4 py-3 tabular-nums">#{item.publicationVersion}</td><td className="px-4 py-3 tabular-nums">v{versionNumber(item.announcementVersionId) ?? '?'}</td><td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3 tabular-nums">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '—'}</td><td className="px-4 py-3 tabular-nums">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '—'}</td><td className="px-4 py-3 tabular-nums">{item.recipientCount}</td></tr>)}</TableShell>{query.data ? <Pagination {...query.data.meta} onPage={setPage} /> : null}<p className="text-xs text-muted-foreground">{t.scheduledBoundary}</p></section>;
}
