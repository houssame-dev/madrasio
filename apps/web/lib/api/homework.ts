import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/homework/application';
import {
  homeworkCalendarDateSchema, homeworkCreateSchema, homeworkPatchSchema, homeworkSubmissionCreateSchema,
  homeworkSubmissionPatchSchema, homeworkSubmissionReviewSchema, homeworkTargetsCreateSchema,
} from '@/lib/modules/homework/domain';

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
async function id(context: Params): Promise<string> {
  const parsed = uuid.safeParse((await context.params).id);
  if (!parsed.success) throw new ValidationError('Route parameter id is invalid.');
  return parsed.data;
}
async function run(operation: () => Promise<Response>) {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}
function one(data: unknown, status = 200) { return Response.json({ data }, { status }); }

export function homeworksGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
      classId: uuid.optional(),
      academicYearId: uuid.optional(),
      dueFrom: homeworkCalendarDateSchema.optional(),
      dueTo: homeworkCalendarDateSchema.optional(),
      search: z.string().trim().min(1).max(100).optional(),
    }).strict().refine(
      (value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo,
      { message: 'dueFrom must be on or before dueTo.', path: ['dueTo'] },
    ));
    const value = await actor();
    return Response.json(await service.listHomework(value.db, value.actor, input));
  });
}

export function homeworksPOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, homeworkCreateSchema);
    const value = await actor();
    return one(await service.createHomework(value.db, value.actor, input), 201);
  });
}

export function homeworkGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getHomework(value.db, value.actor, await id(context)));
  });
}

export function homeworkPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, homeworkPatchSchema);
    const value = await actor();
    return one(await service.patchHomework(value.db, value.actor, await id(context), input));
  });
}

export function homeworkTargetsGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.listHomeworkTargets(value.db, value.actor, await id(context)));
  });
}

export function homeworkTargetsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, homeworkTargetsCreateSchema);
    const value = await actor();
    return one(await service.addHomeworkTargets(value.db, value.actor, await id(context), input), 201);
  });
}

export function homeworkSubmissionsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED']).optional(),
      studentId: uuid.optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listHomeworkSubmissions(value.db, value.actor, await id(context), input));
  });
}

export function homeworkSubmissionsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, homeworkSubmissionCreateSchema);
    const value = await actor();
    return one(await service.createHomeworkSubmission(value.db, value.actor, await id(context), input), 201);
  });
}

export function homeworkStudentsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object(baseQuery).strict());
    const value = await actor();
    return Response.json(await service.listHomeworkStudents(value.db, value.actor, await id(context), input));
  });
}

export function homeworkSubmissionGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getHomeworkSubmission(value.db, value.actor, await id(context)));
  });
}

export function homeworkSubmissionPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, homeworkSubmissionPatchSchema);
    const value = await actor();
    return one(await service.patchHomeworkSubmission(value.db, value.actor, await id(context), input));
  });
}

export function homeworkSubmissionReviewPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, homeworkSubmissionReviewSchema);
    const value = await actor();
    return one(await service.reviewHomeworkSubmission(value.db, value.actor, await id(context), input));
  });
}
