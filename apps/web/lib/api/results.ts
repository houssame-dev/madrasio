import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/grades/application';
import type { ResultType } from '@/lib/modules/grades/domain';

import { parseBody, toApiErrorResponse } from './errors';

export { parseBody, toApiErrorResponse } from './errors';
export const toResultErrorResponse = toApiErrorResponse;

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const resultType = z.enum(['SUBJECT', 'PERIOD', 'ANNUAL']);
const baseQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
};

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
function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
  return parsed.data as output<S>;
}
async function run(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); } catch (error) { return toApiErrorResponse(error); }
}
const one = (data: unknown, status = 200) => Response.json({ data }, { status });

export function subjectCalculatePOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, z.object({ gradebookId: uuid, studentId: uuid }).strict());
    const value = await actor();
    return one(await service.calculateSubjectResult(value.db, {
      ...value.actor, gradebookId: input.gradebookId, studentId: input.studentId,
    }), 201);
  });
}

export function periodCalculatePOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, z.object({
      studentId: uuid, academicYearId: uuid, academicPeriodId: uuid, classId: uuid,
    }).strict());
    const value = await actor();
    return one(await service.calculatePeriodResult(value.db, { ...value.actor, ...input }), 201);
  });
}

export function annualCalculatePOST(request: Request) {
  return run(async () => {
    const input = await parseBody(request, z.object({
      studentId: uuid, academicYearId: uuid, classId: uuid,
    }).strict());
    const value = await actor();
    return one(await service.calculateAnnualResult(value.db, { ...value.actor, ...input }), 201);
  });
}

export function resultFinalizePOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, z.object({ resultType }).strict());
    const value = await actor();
    return one(await service.finalizeResult(value.db, {
      ...value.actor, resultType: input.resultType, resultId: await id(context),
    }));
  });
}

export function resultPublishPOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, z.object({
      resultType, idempotencyKey: uuid, revision: z.boolean().optional().default(false),
    }).strict());
    const value = await actor();
    return one(await service.publishResult(value.db, {
      ...value.actor, resultType: input.resultType, resultId: await id(context),
      idempotencyKey: input.idempotencyKey, revision: input.revision,
    }), 201);
  });
}

export function resultRevisePOST(request: Request, context: Params) {
  return run(async () => {
    const input = await parseBody(request, z.object({ resultType, idempotencyKey: uuid }).strict());
    const value = await actor();
    return one(await service.reviseResult(value.db, {
      ...value.actor, resultType: input.resultType, resultId: await id(context),
      idempotencyKey: input.idempotencyKey,
    }), 201);
  });
}

const commonResultQuery = {
  ...baseQuery,
  studentId: uuid.optional(),
  academicYearId: uuid.optional(),
  classId: uuid.optional(),
  status: z.enum(['CALCULATED', 'FINALIZED']).optional(),
};
const subjectResultQuery = z.object({
  ...commonResultQuery, academicPeriodId: uuid.optional(), subjectId: uuid.optional(),
}).strict();
const periodResultQuery = z.object({
  ...commonResultQuery, academicPeriodId: uuid.optional(),
}).strict();
const annualResultQuery = z.object(commonResultQuery).strict();

function resultsGET(request: Request, type: ResultType) {
  return run(async () => {
    const input = type === 'SUBJECT'
      ? query(request, subjectResultQuery)
      : type === 'PERIOD'
        ? query(request, periodResultQuery)
        : query(request, annualResultQuery);
    const value = await actor();
    return Response.json(await service.listResults(value.db, value.actor, type, input));
  });
}

export const subjectResultsGET = (request: Request) => resultsGET(request, 'SUBJECT');
export const periodResultsGET = (request: Request) => resultsGET(request, 'PERIOD');
export const annualResultsGET = (request: Request) => resultsGET(request, 'ANNUAL');

export function resultGET(request: Request, context: Params) {
  return run(async () => {
    const input = query(request, z.object({ resultType }).strict());
    const value = await actor();
    return one(await service.getResult(value.db, value.actor, input.resultType, await id(context)));
  });
}
