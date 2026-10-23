'use client';
import { useNotificationLabels } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useTranslations, useLocale } from 'next-intl';

import { Bell, Check, Megaphone } from 'lucide-react';
import { cn } from '@school/shared';
import type { NotificationDto } from '@/lib/frontend/notifications/types';

export function NotificationRow({ notification, onOpen }: { notification: NotificationDto; onOpen: (id: string) => void }) {
  const text = useDeliveryText();
  const msg = useTranslations();
  const locale = useLocale();
  const { notificationSourceLabels, notificationTypeLabels } = useNotificationLabels();
  const unread = notification.readAt === null;
  const Icon = notification.sourceType === 'ANNOUNCEMENT_PUBLICATION' ? Megaphone : Bell;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification.id)}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-start transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          unread && 'border-accent/60 bg-accent/10',
        )}
        aria-label={msg('deliveryUi.notificationLabel', { state: text(unread ? 'Unread' : 'Read'), title: notification.title })}
      >
        <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground', unread && 'bg-accent/20 text-foreground')}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <span className={cn('break-words text-sm', unread ? 'font-semibold' : 'font-medium')}><bdi>{notification.title}</bdi></span>
            <time dir="auto" className="shrink-0 text-xs text-muted-foreground" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString(locale)}</time>
          </span>
          <span dir="auto" className="mt-1 block line-clamp-2 break-words text-sm text-muted-foreground">{notification.body}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{notificationTypeLabels[notification.notificationType]}</span>
            <span aria-hidden="true">·</span>
            <span>{notificationSourceLabels[notification.sourceType]}</span>
            <span aria-hidden="true">·</span>
            {unread ? <span className="font-medium text-foreground">{text("Unread")}</span> : <span className="inline-flex items-center gap-1"><Check className="size-3" aria-hidden="true" />{text("Read")}</span>}
          </span>
        </span>
        {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
      </button>
    </li>
  );
}
