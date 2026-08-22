import { z } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/grades/application';
import { bulkGradeEntrySchema } from '@/lib/modules/grades/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();

async function actor() {
  const db = getDb();
  const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
async function id(context: Params) {
  const parsed = uuid.safeParse((await context.params).id);
  if (!parsed.success) throw new ValidationError('Route parameter id must be a valid UUID.');
  return parsed.data;
}
async function run(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}

export function gradeMatrixGET(request: Request, context: Params) {
  return run(async () => {
    const parsed = z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(50),
    }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
    }
    const value = await actor();
    return Response.json(await service.getGradebookMatrix(
      value.db, value.actor, await id(context), parsed.data,
    ));
  });
}

export function assessmentGradesPUT(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, bulkGradeEntrySchema);
    const value = await actor();
    return Response.json({
      data: await service.putAssessmentGrades(value.db, value.actor, await id(context), input),
    });
  });
}

