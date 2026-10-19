import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { parseBody, toApiErrorResponse } from './errors';
import { publishSchema, publishedQuerySchema } from '@/lib/modules/timetable/domain/publication';
import { publishDraft, readPublished } from '@/lib/modules/timetable/application/publication';
import { z } from 'zod';
async function run(work: () => Promise<unknown>) {
  let response: Response;
  try { response = Response.json({ data: await work() }); }
  catch (error) { response = toApiErrorResponse(error instanceof z.ZodError ? new ValidationError('Invalid timetable publication input.') : error); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie'); return response;
}
async function actor() { const db = getDb(), c = await requireCurrentContext(db); if (!c.schoolContext) throw new ForbiddenError(); return { db, actor: { userId: c.userId, schoolId: c.schoolContext.schoolId } }; }
export function GET(request: Request) { return run(async () => {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ValidationError('Repeated parameter.');
  const query = publishedQuerySchema.parse(Object.fromEntries(params)), v = await actor(); return readPublished(v.db, v.actor, query);
}); }
export function POST(request: Request) { return run(async () => {
  const origin = request.headers.get('origin');
  try { if (!origin || new URL(origin).origin !== origin || origin !== new URL(request.url).origin) throw new Error(); } catch { throw new ForbiddenError(); }
  const input = await parseBody(request, publishSchema), v = await actor(); return publishDraft(v.db, v.actor, input);
}); }
