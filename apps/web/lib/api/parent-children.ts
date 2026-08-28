import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/parents/application';

import { toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();

async function studentId(context: Params) {
  const parsed = uuid.safeParse((await context.params).studentId);
  if (!parsed.success) throw new ValidationError('Route parameter studentId must be a valid UUID.');
  return parsed.data;
}
function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
  return parsed.data as output<S>;
}
async function actor() {
  const db = getDb();
  const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}

export function childAcademicYearsGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return Response.json(await service.listChildAcademicYears(value.db, value.actor, await studentId(context)));
  });
}

export function childPlacementGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({ academicYearId: uuid }).strict());
    const value = await actor();
    return Response.json({ data: await service.getChildPlacement(value.db, value.actor, await studentId(context), input.academicYearId) });
  });
}

export function childResultsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({
      academicYearId: uuid,
      academicPeriodId: uuid.optional(),
      resultType: z.enum(['SUBJECT', 'PERIOD', 'ANNUAL']),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(50),
    }).strict().superRefine((value, refinement) => {
      if (value.resultType === 'ANNUAL' && value.academicPeriodId) refinement.addIssue({ code: 'custom', path: ['academicPeriodId'], message: 'Annual Results do not accept academicPeriodId.' });
    }));
    const value = await actor();
    return Response.json(await service.listChildPublishedResults(value.db, value.actor, await studentId(context), input));
  });
}
