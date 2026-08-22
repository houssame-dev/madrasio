import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/teachers/application';
import {
  assignmentCreateSchema, endAssignmentSchema, teacherCreateSchema, teacherPatchSchema,
} from '@/lib/modules/teachers/domain';

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

async function id(context: Params) {
  const parsed = uuid.safeParse((await context.params).id);
  if (!parsed.success) throw new ValidationError('Route parameter id must be a valid UUID.');
  return parsed.data;
}

async function run(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}
const one = (data: unknown, status = 200) => Response.json({ data }, { status });

export function teachersGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
      teacherCode: z.string().trim().min(1).max(100).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      academicYearId: uuid.optional(),
      classId: uuid.optional(),
      subjectId: uuid.optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listTeachers(value.db, value.actor, input));
  });
}

export function teachersPOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, teacherCreateSchema);
    const value = await actor();
    return one(await service.createTeacher(value.db, value.actor, input), 201);
  });
}

export function teacherGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getTeacher(value.db, value.actor, await id(context)));
  });
}

export function teacherPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, teacherPatchSchema);
    const value = await actor();
    return one(await service.patchTeacher(value.db, value.actor, await id(context), input));
  });
}

export function assignmentsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['ACTIVE', 'ENDED']).optional(),
      academicYearId: uuid.optional(),
      classId: uuid.optional(),
      subjectId: uuid.optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listAssignmentHistory(
      value.db,
      value.actor,
      await id(context),
      input,
    ));
  });
}

export function assignmentsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, assignmentCreateSchema);
    const value = await actor();
    return one(await service.createAssignment(
      value.db,
      value.actor,
      await id(context),
      input,
    ), 201);
  });
}

export function endAssignmentPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, endAssignmentSchema);
    const value = await actor();
    return one(await service.endAssignment(value.db, value.actor, await id(context), input));
  });
}
