import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toApiErrorResponse } from '@/lib/api/errors';
import { parentWeekOverview } from '@/lib/modules/parents/application/dashboard-read-service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ studentId: string }> }) {
  let response: Response;
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw new ValidationError('Repeated parameter.');
    const parsed = z.object({ academicYearId:z.string().uuid() }).strict().safeParse(Object.fromEntries(params));
    const studentId = z.string().uuid().safeParse((await context.params).studentId);
    if (!parsed.success || !studentId.success) throw new ValidationError('Invalid child dashboard context.');
    const db = getDb(), auth = await requireCurrentContext(db);
    if (auth.role !== 'PARENT' || !auth.schoolContext) throw new ForbiddenError();
    response = Response.json({ data:await parentWeekOverview(db,{ schoolId:auth.schoolContext.schoolId,userId:auth.userId },studentId.data,parsed.data.academicYearId) });
  } catch(error) { response = toApiErrorResponse(error); }
  response.headers.set('Cache-Control','private, no-store'); response.headers.set('Vary','Cookie'); return response;
}
