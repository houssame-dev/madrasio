'use client';
import { useNotificationCopy, useNotificationLabels } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useLocale } from 'next-intl';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@school/ui';
import { Modal } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { notificationErrorMessage } from '@/lib/frontend/notifications/errors';
import { refreshNotificationReadState } from '@/lib/frontend/notifications/mutations';
import { notificationKeys } from '@/lib/frontend/notifications/queries';

export function NotificationDetail({ schoolId, notificationId, onClose }: { schoolId: string; notificationId: string | null; onClose: () => void }) {
  const t = useNotificationCopy();
  const text = useDeliveryText();
  const locale = useLocale();
  const { notificationSourceLabels, notificationTypeLabels } = useNotificationLabels();
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
        <ApiErrorState description={text(notificationErrorMessage(detail.error))} onRetry={() => void detail.refetch()} />
      ) : value ? (
        <article className="min-w-0 space-y-5 break-words">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="min-w-0 break-words text-xl font-semibold tracking-tight"><bdi>{value.title}</bdi></h3>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">{value.readAt ? t.read : t.unread}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{notificationSourceLabels[value.sourceType]} · {t.received} <time dir="auto" dateTime={value.createdAt}>{new Date(value.createdAt).toLocaleString(locale)}</time></p>
          </div>
          <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6">{value.body}</p>
          {value.destination && /^\/children\/[0-9a-f-]{36}\/results\/[0-9a-f-]{36}$/.test(value.destination) ? <Link className="inline-flex min-h-10 items-center rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring" href={value.destination}>{text("View published result and history")}</Link> : value.sourceType === 'RESULT_PUBLICATION' ? <p>{text("Published result navigation is unavailable for your current access.")}</p> : null}
          {value.sourceType === 'ANNOUNCEMENT_PUBLICATION' ? value.destination && /^\/announcements\/inbox\/[0-9a-f-]{36}$/.test(value.destination) ? <Link className="inline-flex min-h-10 items-center rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring" href={value.destination}>{text("Read published announcement")}</Link> : <p>{text("Published announcement navigation is unavailable for your current access.")}</p> : null}
          {markRead.isError ? <p role="alert" className="text-sm text-destructive">{text(notificationErrorMessage(markRead.error))}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
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
