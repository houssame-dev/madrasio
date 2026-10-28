import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { parseBody, toApiErrorResponse } from './errors';
import { createHolidaySchema, updateHolidaySchema, removeHolidaySchema, holidayQuerySchema } from '@/lib/modules/school-holidays/contracts';
import { listSchoolHolidays, mutateSchoolHoliday, readSchoolHoliday } from '@/lib/modules/school-holidays/service';
type Context = { params: Promise<{ id: string }> };
async function actor() { const db = getDb(), c = await requireCurrentContext(db); if (!c.schoolContext) throw new ForbiddenError(); return { db, actor: { userId: c.userId, schoolId: c.schoolContext.schoolId } }; }
async function run(work: () => Promise<unknown>) {
  let response: Response;
  try { response = Response.json(await work()); } catch (e) { response = toApiErrorResponse(e instanceof z.ZodError ? new ValidationError('Invalid School Calendar request.') : e); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie'); return response;
}
function origin(request: Request) { if (request.headers.get('origin') !== new URL(request.url).origin) throw new ForbiddenError(); }
export const listGET = (request: Request) => run(async () => {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw new ValidationError('Repeated query parameter.');
  const input = holidayQuerySchema.parse(Object.fromEntries(params)), v = await actor(); return listSchoolHolidays(v.db, v.actor, input);
});
export const createPOST = (request: Request) => run(async () => { origin(request); const input = await parseBody(request, createHolidaySchema), v = await actor(); return { data: await mutateSchoolHoliday(v.db, v.actor, 'create', input) }; });
export const detailGET = (_request: Request, context: Context) => run(async () => { const id = z.string().uuid().parse((await context.params).id), v = await actor(); return { data: await readSchoolHoliday(v.db, v.actor, id) }; });
export const updatePATCH = (request: Request, context: Context) => run(async () => { origin(request); const id = z.string().uuid().parse((await context.params).id), input = await parseBody(request, updateHolidaySchema), v = await actor(); return { data: await mutateSchoolHoliday(v.db, v.actor, 'update', input, id) }; });
export const removeDELETE = (request: Request, context: Context) => run(async () => { origin(request); const id = z.string().uuid().parse((await context.params).id), input = await parseBody(request, removeHolidaySchema), v = await actor(); return { data: await mutateSchoolHoliday(v.db, v.actor, 'remove', input, id) }; });
