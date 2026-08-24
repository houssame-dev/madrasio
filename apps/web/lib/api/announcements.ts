/**
 * HTTP adapter for the Announcements module (Task 011).
 *
 * Thin route-handler helpers: request parsing (Zod) and error mapping only.
 * No business logic here — handlers delegate to
 * `modules/announcements/application/*` use cases and translate results into
 * DTOs (`lib/api/README.md`, CLAUDE.md §25/§28/§29).
 */

import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/announcements/application';
import {
  announcementCreateSchema, announcementPatchSchema, announcementPublishSchema,
  announcementTargetsCreateSchema, announcementVersionCreateSchema,
} from '@/lib/modules/announcements/domain';

import { parseBody, toApiErrorResponse } from './errors';

export { parseBody, toApiErrorResponse } from './errors';

/** Announcements-alias of the shared error mapper. */
export const toAnnouncementErrorResponse = toApiErrorResponse;

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const baseQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};

function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
  return parsed.data as output<S>;
}
async function actor() {
  const db = getDb();
  const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
async function id(context: Params) {
  const parsed = uuid.safeParse((await context.params).id);
  if (!parsed.success) throw new ValidationError('Route parameter id is invalid.');
  return parsed.data;
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}
function one(data: unknown, status = 200) { return Response.json({ data }, { status }); }

export function announcementsGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
      audience: z.enum(['PARENTS', 'TEACHERS']).optional(),
      targetType: z.enum(['SCHOOL', 'CLASS']).optional(),
      classId: uuid.optional(),
      publicationStatus: z.enum(['SCHEDULED', 'PUBLISHED']).optional(),
      createdFrom: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
      createdTo: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
      search: z.string().trim().min(1).max(100).optional(),
    }).strict().refine(
      (value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo,
      { message: 'createdFrom must be on or before createdTo.', path: ['createdTo'] },
    ));
    const value = await actor();
    return Response.json(await service.listAnnouncements(value.db, value.actor, input));
  });
}

export function announcementsPOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, announcementCreateSchema);
    const value = await actor();
    return one(await service.createAnnouncement(value.db, value.actor, input), 201);
  });
}

export function announcementGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getAnnouncement(value.db, value.actor, await id(context)));
  });
}

export function announcementPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, announcementPatchSchema);
    const value = await actor();
    return one(await service.patchAnnouncement(value.db, value.actor, await id(context), input));
  });
}

export function announcementVersionsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object(baseQuery).strict());
    const value = await actor();
    return Response.json(await service.listAnnouncementVersions(value.db, value.actor, await id(context), input));
  });
}

export function announcementVersionsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, announcementVersionCreateSchema);
    const value = await actor();
    return one(await service.createAnnouncementVersion(value.db, value.actor, await id(context), input), 201);
  });
}

export function announcementTargetsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({ announcementVersionId: uuid.optional() }).strict());
    const value = await actor();
    return one(await service.listAnnouncementTargets(
      value.db, value.actor, await id(context), input.announcementVersionId,
    ));
  });
}

export function announcementTargetsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, announcementTargetsCreateSchema);
    const value = await actor();
    return one(await service.addAnnouncementTargets(value.db, value.actor, await id(context), input), 201);
  });
}

export function announcementPublicationsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object(baseQuery).strict());
    const value = await actor();
    return Response.json(await service.listAnnouncementPublications(value.db, value.actor, await id(context), input));
  });
}

export function announcementPublishPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, announcementPublishSchema);
    const value = await actor();
    const result = await service.publishAnnouncement(value.db, {
      ...value.actor,
      announcementId: await id(context),
      announcementVersionId: input.announcementVersionId,
      idempotencyKey: input.idempotencyKey,
      scheduledAt: input.scheduledAt,
    });
    const { schoolId: _schoolId, ...data } = result;
    return one(data, 201);
  });
}
