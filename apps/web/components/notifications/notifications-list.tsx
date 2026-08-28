'use client';

import { Pagination } from '@/components/academic/ui';
import { EmptyState, InlineLoading } from '@/components/ui/states';
import { notificationCopy as t } from '@/lib/frontend/notifications/copy';
import type { NotificationPage, NotificationReadStatus, NotificationSourceType } from '@/lib/frontend/notifications/types';
import { NotificationRow } from './notification-row';

export function NotificationsList({
  result,
  loading,
  status,
  sourceType,
  onOpen,
  onPage,
}: {
  result?: NotificationPage;
  loading: boolean;
  status: NotificationReadStatus;
  sourceType?: NotificationSourceType;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
}) {
  if (loading) return <div className="rounded-lg border bg-card p-6"><InlineLoading label={t.loading} /></div>;
  if (!result || result.data.length === 0) {
    const filtered = sourceType !== undefined || status === 'READ';
    const title = status === 'UNREAD' && !sourceType ? t.unreadEmpty : filtered ? t.filteredEmpty : t.empty;
    const description = status === 'UNREAD' && !sourceType ? t.unreadEmptyDescription : filtered ? t.filteredEmptyDescription : t.emptyDescription;
    return <EmptyState title={title} description={description} />;
  }
  return (
    <div className="space-y-4">
      <ul className="grid gap-2" aria-live="polite">
        {result.data.map((notification) => <NotificationRow key={notification.id} notification={notification} onOpen={onOpen} />)}
      </ul>
      <Pagination {...result.meta} onPage={onPage} />
    </div>
  );
}
