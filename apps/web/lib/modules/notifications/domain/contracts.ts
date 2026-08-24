import { z } from 'zod';

import { NOTIFICATION_SOURCE_TYPES, NOTIFICATION_TYPES } from './notification-vocabulary';

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));

export const notificationInboxQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(['ALL', 'READ', 'UNREAD']).default('ALL'),
  notificationType: z.enum(NOTIFICATION_TYPES).optional(),
  sourceType: z.enum(NOTIFICATION_SOURCE_TYPES).optional(),
  sourceId: uuid.optional(),
  createdFrom: instant.optional(),
  createdTo: instant.optional(),
}).strict().refine(
  (value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo,
  { message: 'createdFrom must be on or before createdTo.', path: ['createdTo'] },
);

export type NotificationInboxQuery = z.output<typeof notificationInboxQuerySchema>;

export interface NotificationView {
  id: string;
  notificationType: (typeof NOTIFICATION_TYPES)[number];
  sourceType: (typeof NOTIFICATION_SOURCE_TYPES)[number];
  sourceId: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  data: NotificationView[];
  meta: { page: number; pageSize: number; total: number };
}
