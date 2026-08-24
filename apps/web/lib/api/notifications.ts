import { z } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/notifications/application';
import { notificationInboxQuerySchema } from '@/lib/modules/notifications/domain';

import { toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();

async function actor() {
  const db = getDb();
  const context = await requireCurrentContext(db);
  return {
    db,
    actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId },
  };
}

async function id(context: Params) {
  const parsed = uuid.safeParse((await context.params).id);
  if (!parsed.success) throw new ValidationError('Route parameter id is invalid.');
  return parsed.data;
}

function query(request: Request) {
  const parsed = notificationInboxQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

async function assertEmptyBody(request: Request) {
  if ((await request.text()).trim().length > 0) {
    throw new ValidationError('This action does not accept a request body.');
  }
}

async function run(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

function one(data: unknown) {
  return Response.json({ data });
}

export function notificationsGET(request: Request) {
  return run(async () => {
    const input = query(request);
    const value = await actor();
    return Response.json(await service.listNotificationInbox(value.db, value.actor, input));
  });
}

export function notificationGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getNotification(value.db, value.actor, await id(context)));
  });
}

export function notificationReadPOST(request: Request, context: Params) {
  return run(async () => {
    await assertEmptyBody(request);
    const value = await actor();
    return one(await service.markInboxNotificationRead(value.db, value.actor, await id(context)));
  });
}

export function notificationsReadAllPOST(request: Request) {
  return run(async () => {
    await assertEmptyBody(request);
    const value = await actor();
    return one(await service.markNotificationInboxRead(value.db, value.actor));
  });
}

export function notificationsUnreadCountGET() {
  return run(async () => {
    const value = await actor();
    return one(await service.getUnreadNotificationCount(value.db, value.actor));
  });
}
