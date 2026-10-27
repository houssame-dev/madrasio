import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { resultBatchCommand, resultBatchQuery } from '@/lib/modules/grades/domain/result-batch';
import {
  executeResultBatch,
  previewResultBatch,
} from '@/lib/modules/grades/application/result-batch';
import { parseBody, toApiErrorResponse } from './errors';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
async function run(action: () => Promise<unknown>) {
  try {
    return Response.json({ data: await action() }, { headers });
  } catch (error) {
    const response = toApiErrorResponse(
      error instanceof z.ZodError ? new ValidationError('Invalid batch input.') : error,
    );
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  }
}
async function actor() {
  const db = getDb();
  const c = await requireCurrentContext(db);
  return { db, actor: { userId: c.userId, schoolId: c.schoolContext!.schoolId } };
}
export function batchGET(request: Request) {
  return run(async () => {
    const p = new URL(request.url).searchParams;
    for (const key of p.keys())
      if (p.getAll(key).length !== 1) throw new ValidationError('Repeated query parameter.');
    const permitted = [
      'resultType',
      'academicYearId',
      'academicPeriodId',
      'classId',
      'gradebookId',
      'operation',
      'page',
    ];
    for (const key of p.keys())
      if (!permitted.includes(key)) throw new ValidationError('Unknown query parameter.');
    const { operation, page, ...scope } = Object.fromEntries(p);
    const input = resultBatchQuery.parse({ scope, operation, page: page ? Number(page) : 1 });
    const v = await actor();
    return previewResultBatch(v.db, v.actor, input);
  });
}
export function batchPOST(request: Request) {
  return run(async () => {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ForbiddenError();
    const input = await parseBody(request, resultBatchCommand);
    const v = await actor();
    return executeResultBatch(v.db, v.actor, input);
  });
}
