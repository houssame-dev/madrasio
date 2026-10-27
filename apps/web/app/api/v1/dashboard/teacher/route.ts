import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toApiErrorResponse } from '@/lib/api/errors';
import { teacherWorkspace } from '@/lib/modules/dashboard/teacher-workspace';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let response: Response;
  try {
    const db = getDb(), context = await requireCurrentContext(db);
    if (context.role !== 'TEACHER') throw new ForbiddenError();
    if (new URL(request.url).searchParams.size) throw new ValidationError('Teacher workspace accepts no scope overrides.');
    response = Response.json({ data: await teacherWorkspace(db, { schoolId: context.schoolContext!.schoolId, userId: context.userId! }) });
  } catch (error) { response = toApiErrorResponse(error); }
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie');
  return response;
}
