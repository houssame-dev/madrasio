import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/attendance/application';
import { bulkAttendanceSchema, calendarDateSchema } from '@/lib/modules/attendance/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const baseQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};

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
async function param(context: Params, key: string, schema: ZodTypeAny): Promise<string> {
  const parsed = schema.safeParse((await context.params)[key]);
  if (!parsed.success) throw new ValidationError(`Route parameter ${key} is invalid.`);
  return parsed.data as string;
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}

export function dailyAttendanceGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object(baseQuery).strict());
    const value = await actor();
    return Response.json(await service.getDailyAttendance(
      value.db,
      value.actor,
      await param(context, 'id', uuid),
      await param(context, 'date', calendarDateSchema),
      input,
    ));
  });
}

export function dailyAttendancePUT(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, bulkAttendanceSchema);
    const value = await actor();
    return Response.json({ data: await service.putDailyAttendance(
      value.db,
      value.actor,
      await param(context, 'id', uuid),
      await param(context, 'date', calendarDateSchema),
      input,
    ) });
  });
}

export function studentAttendanceGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      academicYearId: uuid.optional(),
      classId: uuid.optional(),
      dateFrom: calendarDateSchema.optional(),
      dateTo: calendarDateSchema.optional(),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']).optional(),
    }).strict().refine(
      (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
      { message: 'dateFrom must be on or before dateTo.', path: ['dateTo'] },
    ));
    const value = await actor();
    return Response.json(await service.getStudentAttendanceHistory(
      value.db, value.actor, await param(context, 'id', uuid), input,
    ));
  });
}
