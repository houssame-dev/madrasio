import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/students/application';
import {
  endEnrollmentSchema, enrollmentCreateSchema, studentCreateSchema,
  studentPatchSchema, transferStudentSchema,
} from '@/lib/modules/students/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const baseQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};

function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
  }
  return parsed.data as output<S>;
}

async function actor() {
  const db = getDb();
  const context = await requireCurrentContext(db);
  return {
    db,
    actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId },
  };
}

async function id(context: Params, key = 'id') {
  const parsed = uuid.safeParse((await context.params)[key]);
  if (!parsed.success) throw new ValidationError(`Route parameter ${key} must be a valid UUID.`);
  return parsed.data;
}

async function run(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}
const one = (data: unknown, status = 200) => Response.json({ data }, { status });

export function studentsGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['ACTIVE', 'INACTIVE', 'WITHDRAWN', 'ARCHIVED']).optional(),
      studentCode: z.string().trim().min(1).max(100).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      academicYearId: uuid.optional(),
      classId: uuid.optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listStudents(value.db, value.actor, input));
  });
}

export function studentsPOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, studentCreateSchema);
    const value = await actor();
    return one(await service.createStudent(value.db, value.actor, input), 201);
  });
}

export function studentGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getStudent(value.db, value.actor, await id(context)));
  });
}

export function studentPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, studentPatchSchema);
    const value = await actor();
    return one(await service.patchStudent(value.db, value.actor, await id(context), input));
  });
}

export function enrollmentsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({ ...baseQuery, academicYearId: uuid.optional() }).strict());
    const value = await actor();
    return Response.json(await service.listEnrollmentHistory(
      value.db,
      value.actor,
      await id(context),
      input,
    ));
  });
}

export function enrollmentsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, enrollmentCreateSchema);
    const value = await actor();
    return one(await service.createEnrollment(
      value.db,
      value.actor,
      await id(context),
      input,
    ), 201);
  });
}

export function transferPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, transferStudentSchema);
    const value = await actor();
    return one(await service.transferStudent(value.db, value.actor, await id(context), input));
  });
}

export function currentEnrollmentGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({ academicYearId: uuid }).strict());
    const value = await actor();
    return one(await service.getCurrentEnrollment(
      value.db,
      value.actor,
      await id(context),
      input.academicYearId,
    ));
  });
}

export function endEnrollmentPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, endEnrollmentSchema);
    const value = await actor();
    return one(await service.endEnrollment(value.db, value.actor, await id(context), input));
  });
}
