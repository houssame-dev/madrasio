import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toApiErrorResponse } from './errors';
import { adminOverview, workspaceContext } from '@/lib/modules/dashboard/overview';

export async function readDashboard(request: Request, contextOnly = false) {
  let response: Response;
  try {
    const db = getDb(), context = await requireCurrentContext(db);
    if (!contextOnly && context.role !== 'SCHOOL_ADMIN') throw new ForbiddenError();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new ValidationError('Repeated parameter.');
    const query = (contextOnly ? z.object({}).strict() : z.object({ academicYearId: z.string().uuid().optional() }).strict()).safeParse(Object.fromEntries(params));
    if (!query.success) throw new ValidationError('Invalid dashboard query.');
    const actor = { userId: context.userId!, schoolId: context.schoolContext!.schoolId };
    response = Response.json({ data: contextOnly ? await workspaceContext(db, actor) : await adminOverview(db, actor, 'academicYearId' in query.data && typeof query.data.academicYearId === 'string' ? query.data.academicYearId : undefined) });
  } catch (error) { response = toApiErrorResponse(error); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie');
  return response;
}
