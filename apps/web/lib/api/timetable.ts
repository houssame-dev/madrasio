import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/timetable/application/service';
import { configurationSchema, roomSchema, loadSchema } from '@/lib/modules/timetable/domain/contracts';
import { parseBody, toApiErrorResponse } from './errors';
import { draftContextSchema, draftSchema } from '@/lib/modules/timetable/domain/builder';
import { getDraft, saveDraft } from '@/lib/modules/timetable/application/builder';

async function actor() {
  const db = getDb(); const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { if (!origin || origin === 'null' || new URL(origin).origin !== origin || origin !== new URL(request.url).origin) throw new Error(); }
  catch { throw new ForbiddenError(); }
}
async function run(work: () => Promise<unknown>) {
  let response: Response;
  try { response = Response.json({ data: await work() }); }
  catch (error) { response = toApiErrorResponse(error instanceof z.ZodError ? new ValidationError('Invalid timetable input.') : error); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie'); return response;
}
export function GET(request: Request) { return run(async () => {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ValidationError('Repeated parameter.');
  const query = z.object({ academicYearId: z.string().uuid().optional() }).strict().parse(Object.fromEntries(params));
  const v = await actor(); return service.state(v.db, v.actor, query.academicYearId);
}); }
export function configurationPUT(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, configurationSchema); const v = await actor(); return service.saveConfiguration(v.db, v.actor, input); }); }
export function roomPUT(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, roomSchema); const v = await actor(); return service.saveRoom(v.db, v.actor, input); }); }
export function loadPUT(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, loadSchema); const v = await actor(); return service.saveLoad(v.db, v.actor, input); }); }
export function draftGET(request: Request) { return run(async () => {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ValidationError('Repeated parameter.');
  const input = draftContextSchema.parse(Object.fromEntries(params)); const v = await actor(); return getDraft(v.db, v.actor, input);
}); }
export function draftPUT(request: Request) { return run(async () => { sameOrigin(request); const input = await parseBody(request, draftSchema); const v = await actor(); return saveDraft(v.db, v.actor, input); }); }
