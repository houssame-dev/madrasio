import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/attendance/application';
import * as sessions from '@/lib/modules/attendance/application/session-service';
import { sessionAttendanceSchema, sessionIdentitySchema, sessionQuerySchema } from '@/lib/modules/attendance/domain/contracts';
import { ForbiddenError } from '@/lib/errors';
import { bulkAttendanceSchema, calendarDateSchema } from '@/lib/modules/attendance/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const baseQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};

function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ValidationError('Repeated query parameter.');
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
  let response: Response;
  try { response = await operation(); } catch (error) { response = toApiErrorResponse(error instanceof z.ZodError ? new ValidationError('Invalid Attendance input.') : error); }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}

export function sessionsGET(request: Request) {
  return run(async () => { const input = query(request, sessionQuerySchema); const value = await actor(); return Response.json({ data: await sessions.listSessions(value.db, value.actor, input) }); });
}
export function sessionRosterGET(request: Request) {
  return run(async () => {
    const input = query(request, sessionIdentitySchema.extend({ page: baseQuery.page }).strict());
    const value = await actor(); const { page, ...identity } = input;
    return Response.json(await sessions.getSessionRoster(value.db, value.actor, identity, page));
  });
}
export function sessionRosterPUT(request: Request) {
  return run(async () => {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null' || origin !== new URL(request.url).origin) throw new ForbiddenError();
    const input = query(request, sessionIdentitySchema); const body = await parseBody(request, sessionAttendanceSchema); const value = await actor();
    return Response.json({ data: await sessions.putSessionAttendance(value.db, value.actor, input, body) });
  });
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
