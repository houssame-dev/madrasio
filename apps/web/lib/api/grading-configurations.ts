import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/grades/application/configuration-service';
import {
  configurationCreate,
  configurationPage,
  configurationStatus,
  versionCreate,
  versionPatch,
} from '@/lib/modules/grades/domain/configuration-contracts';
import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<{ id: string; versionId?: string }> };
async function ids(context: Params) {
  const parsed = z
    .object({ id: z.string().uuid(), versionId: z.string().uuid().optional() })
    .safeParse(await context.params);
  if (!parsed.success) throw new ValidationError('Invalid resource identifier.');
  return parsed.data;
}
async function run(
  operation: (
    db: ReturnType<typeof getDb>,
    actor: { userId: string; schoolId: string },
  ) => Promise<unknown>,
  status = 200,
  paged = false,
) {
  let response: Response;
  try {
    const db = getDb();
    const context = await requireCurrentContext(db);
    const result = await operation(db, {
      userId: context.userId!,
      schoolId: context.schoolContext!.schoolId,
    });
    response = Response.json(paged ? result : { data: result }, { status });
  } catch (error) {
    response = toApiErrorResponse(error);
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const configurationsGET = (request: Request) =>
  run(
    async (db, actor) => {
      const parsed = z
        .object({ page: configurationPage })
        .strict()
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!parsed.success) throw new ValidationError('Invalid pagination.');
      return service.listConfigurations(db, actor, parsed.data.page);
    },
    200,
    true,
  );
export const configurationsPOST = (request: Request) =>
  run(
    async (db, actor) =>
      service.createConfiguration(db, actor, await parseBody(request, configurationCreate)),
    201,
  );
export const configurationGET = (_request: Request, context: Params) =>
  run(async (db, actor) => service.getConfiguration(db, actor, (await ids(context)).id));
export const configurationPATCH = (request: Request, context: Params) =>
  run(async (db, actor) =>
    service.setConfigurationStatus(
      db,
      actor,
      (await ids(context)).id,
      await parseBody(request, configurationStatus),
    ),
  );
export const versionsPOST = (request: Request, context: Params) =>
  run(
    async (db, actor) =>
      service.createVersion(
        db,
        actor,
        (await ids(context)).id,
        await parseBody(request, versionCreate),
      ),
    201,
  );
export const versionPATCH = (request: Request, context: Params) =>
  run(async (db, actor) => {
    const { id, versionId } = await ids(context);
    if (!versionId) throw new ValidationError('Version is required.');
    return service.patchVersion(db, actor, id, versionId, await parseBody(request, versionPatch));
  });
