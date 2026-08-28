'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle } from 'lucide-react';
import { Button } from '@school/ui';
import { Modal } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationCopy as t, notificationSourceLabels, notificationTypeLabels } from '@/lib/frontend/notifications/copy';
import { notificationErrorMessage } from '@/lib/frontend/notifications/errors';
import { refreshNotificationReadState } from '@/lib/frontend/notifications/mutations';
import { notificationKeys } from '@/lib/frontend/notifications/queries';

export function NotificationDetail({ schoolId, notificationId, onClose }: { schoolId: string; notificationId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: notificationKeys.detail(schoolId, notificationId ?? 'closed'),
    queryFn: () => notificationsApi.detail(notificationId!),
    enabled: notificationId !== null,
  });
  const markRead = useMutation({
    mutationFn: () => notificationsApi.markRead(notificationId!),
    onSuccess: async (notification) => refreshNotificationReadState(queryClient, schoolId, notification),
  });
  const value = detail.data;
  return (
    <Modal open={notificationId !== null} title={t.details} description={value ? notificationTypeLabels[value.notificationType] : undefined} onClose={onClose}>
      {detail.isPending ? <InlineLoading label={t.loading} /> : detail.isError ? (
        <ApiErrorState description={notificationErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      ) : value ? (
        <article className="space-y-5">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-xl font-semibold tracking-tight">{value.title}</h3>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">{value.readAt ? t.read : t.unread}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{notificationSourceLabels[value.sourceType]} · {t.received} <time dateTime={value.createdAt}>{new Date(value.createdAt).toLocaleString()}</time></p>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{value.body}</p>
          {markRead.isError ? <p role="alert" className="text-sm text-destructive">{notificationErrorMessage(markRead.error)}</p> : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>{t.close}</Button>
            {!value.readAt ? <Button type="button" disabled={markRead.isPending} onClick={() => markRead.mutate()}>
              {markRead.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {markRead.isPending ? t.markingRead : t.markRead}
            </Button> : null}
          </div>
        </article>
      ) : null}
    </Modal>
  );
}
