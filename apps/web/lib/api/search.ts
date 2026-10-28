import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { toApiErrorResponse } from './errors';
import { searchQuerySchema } from '@/lib/modules/search/contracts';
import { searchRecords } from '@/lib/modules/search/service';

export async function searchGET(request: Request) {
  let response: Response;
  try {
    const db = getDb(), context = await requireCurrentContext(db);
    if (!context.schoolContext) throw new ForbiddenError();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new ValidationError('Invalid search request.');
    const input = searchQuerySchema.parse(Object.fromEntries(params));
    response = Response.json(await searchRecords(db, { userId: context.userId, schoolId: context.schoolContext.schoolId }, input));
  } catch (error) { response = toApiErrorResponse(error instanceof z.ZodError ? new ValidationError('Invalid search request.') : error); }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}
