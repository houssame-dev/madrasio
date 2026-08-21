import { z, type output, type ZodTypeAny } from 'zod';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import * as service from '@/lib/modules/academic-structure/application';
import {
  academicPeriodCreateSchema, academicPeriodPatchSchema, academicYearCreateSchema,
  academicYearPatchSchema, classCreateSchema, classPatchSchema, curriculumCreateSchema,
  curriculumPatchSchema, curriculumSubjectCreateSchema, curriculumSubjectPatchSchema,
  curriculumVersionCreateSchema, curriculumVersionPatchSchema, levelCreateSchema,
  levelPatchSchema, orderedStructureCreateSchema, orderedStructurePatchSchema,
  subjectCreateSchema, subjectPatchSchema,
} from '@/lib/modules/academic-structure/domain';

import { parseBody, toApiErrorResponse } from './errors';

type Params = { params: Promise<Record<string, string>> };
const uuid = z.string().uuid();
const baseQuery = { page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(50) };
const yearStatus = z.enum(['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
const periodStatus = z.enum(['PLANNED', 'ACTIVE', 'CLOSED']);
const activeStatus = z.enum(['ACTIVE', 'INACTIVE']);
const curriculumStatus = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
const versionStatus = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const classStatus = z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']);

function query<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters.', { issues: parsed.error.issues });
  }
  return parsed.data as output<S>;
}
async function actor() {
  const db = getDb(); const context = await requireCurrentContext(db);
  return { db, actor: { userId: context.userId, schoolId: context.schoolContext!.schoolId } };
}
async function id(context: Params, key = 'id') {
  const parsed = uuid.safeParse((await context.params)[key]);
  if (!parsed.success) throw new ValidationError(`Route parameter ${key} must be a valid UUID.`);
  return parsed.data;
}
async function run(operation: () => Promise<Response>): Promise<Response> { try { return await operation(); } catch (error) { return toApiErrorResponse(error); } }
const one = (data: unknown, status = 200) => Response.json({ data }, { status });

export function academicYearsGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: yearStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listAcademicYears(value.db, value.actor, input)); }); }
export function academicYearsPOST(request: Request) { return run(async () => { const input = await parseBody(request, academicYearCreateSchema); const value = await actor(); return one(await service.createAcademicYear(value.db, value.actor, input), 201); }); }
export function academicYearGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getAcademicYear(value.db, value.actor, await id(context))); }); }
export function academicYearPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, academicYearPatchSchema); const value = await actor(); return one(await service.patchAcademicYear(value.db, value.actor, await id(context), input)); }); }

export function periodsGET(request: Request, context: Params) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: periodStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listAcademicPeriods(value.db, value.actor, await id(context), input)); }); }
export function periodsPOST(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, academicPeriodCreateSchema); const value = await actor(); return one(await service.createAcademicPeriod(value.db, value.actor, await id(context), input), 201); }); }
export function periodGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getAcademicPeriod(value.db, value.actor, await id(context))); }); }
export function periodPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, academicPeriodPatchSchema); const value = await actor(); return one(await service.patchAcademicPeriod(value.db, value.actor, await id(context), input)); }); }

export function stagesGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: activeStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listStages(value.db, value.actor, input)); }); }
export function stagesPOST(request: Request) { return run(async () => { const input = await parseBody(request, orderedStructureCreateSchema); const value = await actor(); return one(await service.createStage(value.db, value.actor, input), 201); }); }
export function stageGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getStage(value.db, value.actor, await id(context))); }); }
export function stagePATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, orderedStructurePatchSchema); const value = await actor(); return one(await service.patchStage(value.db, value.actor, await id(context), input)); }); }

export function levelsGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: activeStatus.optional(), stageId: uuid.optional() }).strict()); const value = await actor(); return Response.json(await service.listLevels(value.db, value.actor, input)); }); }
export function levelsPOST(request: Request) { return run(async () => { const input = await parseBody(request, levelCreateSchema); const value = await actor(); return one(await service.createLevel(value.db, value.actor, input), 201); }); }
export function levelGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getLevel(value.db, value.actor, await id(context))); }); }
export function levelPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, levelPatchSchema); const value = await actor(); return one(await service.patchLevel(value.db, value.actor, await id(context), input)); }); }

export function tracksGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: activeStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listTracks(value.db, value.actor, input)); }); }
export function tracksPOST(request: Request) { return run(async () => { const input = await parseBody(request, orderedStructureCreateSchema); const value = await actor(); return one(await service.createTrack(value.db, value.actor, input), 201); }); }
export function trackGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getTrack(value.db, value.actor, await id(context))); }); }
export function trackPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, orderedStructurePatchSchema); const value = await actor(); return one(await service.patchTrack(value.db, value.actor, await id(context), input)); }); }

export function subjectsGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: activeStatus.optional(), search: z.string().trim().min(1).max(100).optional() }).strict()); const value = await actor(); return Response.json(await service.listSubjects(value.db, value.actor, input)); }); }
export function subjectsPOST(request: Request) { return run(async () => { const input = await parseBody(request, subjectCreateSchema); const value = await actor(); return one(await service.createSubject(value.db, value.actor, input), 201); }); }
export function subjectGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getSubject(value.db, value.actor, await id(context))); }); }
export function subjectPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, subjectPatchSchema); const value = await actor(); return one(await service.patchSubject(value.db, value.actor, await id(context), input)); }); }

export function curriculaGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: curriculumStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listCurricula(value.db, value.actor, input)); }); }
export function curriculaPOST(request: Request) { return run(async () => { const input = await parseBody(request, curriculumCreateSchema); const value = await actor(); return one(await service.createCurriculum(value.db, value.actor, input), 201); }); }
export function curriculumGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getCurriculum(value.db, value.actor, await id(context))); }); }
export function curriculumPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, curriculumPatchSchema); const value = await actor(); return one(await service.patchCurriculum(value.db, value.actor, await id(context), input)); }); }

export function versionsGET(request: Request, context: Params) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: versionStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listCurriculumVersions(value.db, value.actor, await id(context), input)); }); }
export function versionsPOST(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, curriculumVersionCreateSchema); const value = await actor(); return one(await service.createCurriculumVersion(value.db, value.actor, await id(context), input), 201); }); }
export function versionGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getCurriculumVersion(value.db, value.actor, await id(context))); }); }
export function versionPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, curriculumVersionPatchSchema); const value = await actor(); return one(await service.patchCurriculumVersion(value.db, value.actor, await id(context), input)); }); }

export function curriculumSubjectsGET(request: Request, context: Params) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: activeStatus.optional() }).strict()); const value = await actor(); return Response.json(await service.listCurriculumSubjects(value.db, value.actor, await id(context), input)); }); }
export function curriculumSubjectsPOST(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, curriculumSubjectCreateSchema); const value = await actor(); return one(await service.createCurriculumSubject(value.db, value.actor, await id(context), input), 201); }); }
export function curriculumSubjectPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, curriculumSubjectPatchSchema); const value = await actor(); return one(await service.patchCurriculumSubject(value.db, value.actor, await id(context), input)); }); }

export function classesGET(request: Request) { return run(async () => { const input = query(request, z.object({ ...baseQuery, status: classStatus.optional(), academicYearId: uuid.optional(), levelId: uuid.optional(), stageId: uuid.optional(), trackId: uuid.optional() }).strict()); const value = await actor(); return Response.json(await service.listClasses(value.db, value.actor, input)); }); }
export function classesPOST(request: Request) { return run(async () => { const input = await parseBody(request, classCreateSchema); const value = await actor(); return one(await service.createClass(value.db, value.actor, input), 201); }); }
export function classGET(_request: Request, context: Params) { return run(async () => { const value = await actor(); return one(await service.getClass(value.db, value.actor, await id(context))); }); }
export function classPATCH(request: Request, context: Params) { return run(async () => { const input = await parseBody(request, classPatchSchema); const value = await actor(); return one(await service.patchClass(value.db, value.actor, await id(context), input)); }); }
