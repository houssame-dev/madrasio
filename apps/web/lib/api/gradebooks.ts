import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/grades/application';
import {
  assessmentCreateSchema, assessmentPatchSchema, gradebookCreateSchema, gradebookPatchSchema,
} from '@/lib/modules/grades/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a valid calendar date.');
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
const one = (data: unknown, status = 200) => Response.json({ data }, { status });

export function gradebooksGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      academicYearId: uuid.optional(),
      academicPeriodId: uuid.optional(),
      classId: uuid.optional(),
      subjectId: uuid.optional(),
      gradingConfigurationVersionId: uuid.optional(),
      status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listGradebooks(value.db, value.actor, input));
  });
}

export function gradingConfigurationVersionsGET(request: Request) {
  return run(async () => {
    const input = query(request, z.object(baseQuery).strict());
    const value = await actor();
    return Response.json(await service.listEligibleGradingConfigurationVersions(
      value.db, value.actor, input,
    ));
  });
}

export function gradebooksPOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, gradebookCreateSchema);
    const value = await actor();
    return one(await service.createGradebook(value.db, value.actor, input), 201);
  });
}

export function gradebookGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getGradebook(value.db, value.actor, await id(context)));
  });
}

export function gradebookPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, gradebookPatchSchema);
    const value = await actor();
    return one(await service.patchGradebook(value.db, value.actor, await id(context), input));
  });
}

export function assessmentsGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({
      ...baseQuery,
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      assessmentType: z.enum(['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK']).optional(),
      dateFrom: date.optional(),
      dateTo: date.optional(),
    }).strict());
    const value = await actor();
    return Response.json(await service.listAssessments(
      value.db, value.actor, await id(context), input,
    ));
  });
}

export function assessmentsPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, assessmentCreateSchema);
    const value = await actor();
    return one(await service.createAssessment(
      value.db, value.actor, await id(context), input,
    ), 201);
  });
}

export function assessmentGET(_request: Request, context: Params) {
  return run(async () => {
    const value = await actor();
    return one(await service.getAssessment(value.db, value.actor, await id(context)));
  });
}

export function assessmentPATCH(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, assessmentPatchSchema);
    const value = await actor();
    return one(await service.patchAssessment(value.db, value.actor, await id(context), input));
  });
}
