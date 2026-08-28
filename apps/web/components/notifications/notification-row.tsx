'use client';

import { Bell, Check, Megaphone } from 'lucide-react';
import { cn } from '@school/shared';
import { notificationSourceLabels, notificationTypeLabels } from '@/lib/frontend/notifications/copy';
import type { NotificationDto } from '@/lib/frontend/notifications/types';

export function NotificationRow({ notification, onOpen }: { notification: NotificationDto; onOpen: (id: string) => void }) {
  const unread = notification.readAt === null;
  const Icon = notification.sourceType === 'ANNOUNCEMENT_PUBLICATION' ? Megaphone : Bell;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification.id)}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-start transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          unread && 'border-primary/30 bg-primary/[0.035]',
        )}
        aria-label={`${unread ? 'Unread' : 'Read'} notification: ${notification.title}`}
      >
        <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground', unread && 'bg-primary/10 text-primary')}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <span className={cn('break-words text-sm', unread ? 'font-semibold' : 'font-medium')}>{notification.title}</span>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time>
          </span>
          <span className="mt-1 block truncate text-sm text-muted-foreground">{notification.body}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{notificationTypeLabels[notification.notificationType]}</span>
            <span aria-hidden="true">·</span>
            <span>{notificationSourceLabels[notification.sourceType]}</span>
            <span aria-hidden="true">·</span>
            {unread ? <span className="font-medium text-foreground">Unread</span> : <span className="inline-flex items-center gap-1"><Check className="size-3" aria-hidden="true" />Read</span>}
          </span>
        </span>
        {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
      </button>
    </li>
  );
}
