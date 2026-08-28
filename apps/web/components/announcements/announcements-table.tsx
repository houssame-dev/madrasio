'use client';
import Link from 'next/link';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import type { AnnouncementPage } from '@/lib/frontend/announcements/types';

export function AnnouncementsTable({ result, loading, onPage }: { result?: AnnouncementPage; loading: boolean; onPage: (page: number) => void }) {
  return <div className="space-y-4"><TableShell headers={[t.titleField, t.status, t.latestVersion, t.updated, t.actions]} loading={loading}>
    {result?.data.length === 0 ? <EmptyTableRow columns={5} /> : result?.data.map((item) => <tr key={item.id}>
      <td className="max-w-sm px-4 py-3"><p className="truncate font-medium">{item.latestVersion?.title ?? '—'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.latestVersion?.body ?? ''}</p></td>
      <td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3 tabular-nums">{item.latestVersion ? `v${item.latestVersion.versionNumber}` : '—'}</td><td className="px-4 py-3 tabular-nums">{new Date(item.updatedAt).toLocaleString()}</td>
      <td className="px-4 py-3 text-end"><Link className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent" href={`/announcements/${item.id}`}>{t.details}</Link></td>
    </tr>)}
  </TableShell>{result ? <Pagination {...result.meta} onPage={onPage} /> : null}</div>;
}
