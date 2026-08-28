'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, LoaderCircle } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { selectClassName } from '@/components/academic/ui';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { ApiErrorState } from '@/components/ui/states';
import { can } from '@/lib/frontend/permissions';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationCopy as t, notificationSourceLabels, notificationStatusLabels } from '@/lib/frontend/notifications/copy';
import { notificationErrorMessage } from '@/lib/frontend/notifications/errors';
import { refreshNotificationReadState } from '@/lib/frontend/notifications/mutations';
import { notificationKeys } from '@/lib/frontend/notifications/queries';
import { notificationReadStatuses, notificationSourceTypes, type NotificationReadStatus, type NotificationSourceType } from '@/lib/frontend/notifications/types';
import { NotificationDetail } from './notification-detail';
import { NotificationsList } from './notifications-list';

export function NotificationsWorkspace() {
  const app = useAppContext();
  const schoolId = app.currentSchool?.id;
  const role = app.currentSchool?.role;
  const allowed = !!schoolId && can(role, 'notifications.read');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pageValue = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const statusValue = searchParams.get('status');
  const status: NotificationReadStatus = notificationReadStatuses.includes(statusValue as NotificationReadStatus) ? statusValue as NotificationReadStatus : 'ALL';
  const sourceValue = searchParams.get('sourceType');
  const sourceType = notificationSourceTypes.includes(sourceValue as NotificationSourceType) ? sourceValue as NotificationSourceType : undefined;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '' || value === 'ALL') next.delete(key); else next.set(key, String(value));
    }
    const suffix = next.toString();
    router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const params = { page, pageSize: 20, status, sourceType };
  const list = useQuery({ queryKey: notificationKeys.list(schoolId ?? 'no-school', params), queryFn: () => notificationsApi.list(params), enabled: allowed });
  const unread = useQuery({ queryKey: notificationKeys.unreadCount(schoolId ?? 'no-school'), queryFn: notificationsApi.unreadCount, enabled: allowed });
  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: async (result) => {
      setFeedback(result.updatedCount === 0 ? t.allRead : t.markedAllRead(result.updatedCount));
      await refreshNotificationReadState(queryClient, schoolId!);
    },
  });
  if (!allowed || !schoolId) return <AccessDeniedWithReturn />;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></div>
        <div className="flex items-center gap-3 self-start">
          {typeof unread.data?.count === 'number' ? <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium" aria-live="polite">{t.unreadCount(unread.data.count)}</span> : null}
          <Button type="button" variant="outline" disabled={markAll.isPending || unread.data?.count === 0} onClick={() => { setFeedback(null); markAll.mutate(); }}>
            {markAll.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
            {markAll.isPending ? t.markingAllRead : t.markAllRead}
          </Button>
        </div>
      </header>
      <section aria-label={t.filters} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">{t.status}<select className={selectClassName} value={status} onChange={(event) => updateUrl({ status: event.target.value, page: 1 })}>{notificationReadStatuses.map((value) => <option key={value} value={value}>{notificationStatusLabels[value]}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-medium">{t.source}<select className={selectClassName} value={sourceType ?? ''} onChange={(event) => updateUrl({ sourceType: event.target.value || undefined, page: 1 })}><option value="">{t.allSources}</option>{notificationSourceTypes.map((value) => <option key={value} value={value}>{notificationSourceLabels[value]}</option>)}</select></label>
      </section>
      {feedback ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{feedback}</p> : null}
      {markAll.isError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{notificationErrorMessage(markAll.error)}</p> : null}
      {list.isError ? <ApiErrorState title={t.unavailable} description={notificationErrorMessage(list.error)} onRetry={() => void list.refetch()} /> : <NotificationsList result={list.data} loading={list.isPending} status={status} sourceType={sourceType} onOpen={setSelectedId} onPage={(next) => updateUrl({ page: next })} />}
      <NotificationDetail schoolId={schoolId} notificationId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
