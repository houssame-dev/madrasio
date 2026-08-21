import type { Permission } from '@/lib/authorization/permissions';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';

import type {
  AcademicPeriodCreate, AcademicPeriodPatch, AcademicYearCreate, AcademicYearPatch,
  ClassCreate, ClassPatch, CurriculumCreate, CurriculumPatch, CurriculumSubjectCreate,
  CurriculumSubjectPatch, CurriculumVersionCreate, CurriculumVersionPatch, LevelCreate,
  LevelPatch, OrderedStructureCreate, OrderedStructurePatch, PageInput, PageResult,
  SubjectCreate, SubjectPatch,
} from '../domain/contracts';
import { assertDateRange, assertPeriodInsideYear, assertTransition } from '../domain/lifecycle';
import * as repo from '../infrastructure/repositories/academic-structure-repository';
import type { AcademicStructureDb } from '../infrastructure/repositories/academic-structure-repository';
import { AcademicStructureError, isUniqueViolation } from './academic-structure-errors';

export interface Actor { userId: string | null; schoolId: string }
type StatusFilter<T extends string> = { status?: T };

function paging(input: PageInput) { return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize }; }
function page<T>(rows: T[], total: number, input: PageInput): PageResult<T> { return { data: rows, meta: { ...input, total } }; }
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> { const { schoolId: _schoolId, ...data } = row; return data; }
function notFound(resource: string): never { throw new AcademicStructureError('NOT_FOUND', `${resource} was not found.`); }
async function authorize(db: AcademicStructureDb, actor: Actor, permission: Permission) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission, scope: { kind: 'school' } });
}
async function read(db: AcademicStructureDb, actor: Actor) { await authorize(db, actor, 'academic_structure.read'); }
async function manage(db: AcademicStructureDb, actor: Actor) { await authorize(db, actor, 'academic_structure.manage'); }
async function unique<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (isUniqueViolation(error)) throw new AcademicStructureError('DUPLICATE_RESOURCE', 'A resource with the same logical identity already exists.');
    throw error;
  }
}

export async function listAcademicYears(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'>) {
  await read(db, actor); const result = await repo.listAcademicYears(db, actor.schoolId, paging(input), input.status); return page(result.rows.map(view), result.total, input);
}
export async function getAcademicYear(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findAcademicYear(db, actor.schoolId, id); return view(row ?? notFound('Academic year')); }
export async function createAcademicYear(db: AcademicStructureDb, actor: Actor, input: AcademicYearCreate) {
  await manage(db, actor); assertDateRange(input.startDate, input.endDate);
  if (input.status && input.status !== 'PLANNED') assertTransition('academic-year', 'PLANNED', input.status);
  return view(await unique(() => repo.insertAcademicYear(db, actor.schoolId, input)));
}
export async function patchAcademicYear(db: AcademicStructureDb, actor: Actor, id: string, input: AcademicYearPatch) {
  await manage(db, actor); const current = await repo.findAcademicYear(db, actor.schoolId, id); if (!current) notFound('Academic year');
  if (input.status) assertTransition('academic-year', current.status, input.status);
  const startDate = input.startDate ?? current.startDate; const endDate = input.endDate ?? current.endDate; assertDateRange(startDate, endDate);
  const periods = await repo.findPeriodsForYear(db, actor.schoolId, id);
  for (const period of periods) assertPeriodInsideYear(period, { startDate, endDate });
  return view((await unique(() => repo.updateAcademicYear(db, actor.schoolId, id, input))) ?? notFound('Academic year'));
}

export async function listAcademicPeriods(db: AcademicStructureDb, actor: Actor, academicYearId: string, input: PageInput & StatusFilter<'PLANNED' | 'ACTIVE' | 'CLOSED'>) {
  await read(db, actor); if (!await repo.findAcademicYear(db, actor.schoolId, academicYearId)) notFound('Academic year');
  const result = await repo.listAcademicPeriods(db, actor.schoolId, academicYearId, paging(input), input.status); return page(result.rows.map(view), result.total, input);
}
export async function getAcademicPeriod(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findAcademicPeriod(db, actor.schoolId, id); return view(row ?? notFound('Academic period')); }
export async function createAcademicPeriod(db: AcademicStructureDb, actor: Actor, academicYearId: string, input: AcademicPeriodCreate) {
  await manage(db, actor); const year = await repo.findAcademicYear(db, actor.schoolId, academicYearId); if (!year) notFound('Academic year');
  assertPeriodInsideYear(input, year); if (input.status && input.status !== 'PLANNED') assertTransition('period', 'PLANNED', input.status);
  return view(await unique(() => repo.insertAcademicPeriod(db, actor.schoolId, academicYearId, input)));
}
export async function patchAcademicPeriod(db: AcademicStructureDb, actor: Actor, id: string, input: AcademicPeriodPatch) {
  await manage(db, actor); const current = await repo.findAcademicPeriod(db, actor.schoolId, id); if (!current) notFound('Academic period');
  const year = await repo.findAcademicYear(db, actor.schoolId, current.academicYearId); if (!year) notFound('Academic year');
  if (input.status) assertTransition('period', current.status, input.status);
  assertPeriodInsideYear({ startDate: input.startDate ?? current.startDate, endDate: input.endDate ?? current.endDate }, year);
  return view((await unique(() => repo.updateAcademicPeriod(db, actor.schoolId, id, input))) ?? notFound('Academic period'));
}

export async function listStages(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE'>) { await read(db, actor); const result = await repo.listStages(db, actor.schoolId, paging(input), input.status); return page(result.rows.map(view), result.total, input); }
export async function getStage(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findStage(db, actor.schoolId, id); return view(row ?? notFound('Stage')); }
export async function createStage(db: AcademicStructureDb, actor: Actor, input: OrderedStructureCreate) { await manage(db, actor); return view(await unique(() => repo.insertStage(db, actor.schoolId, input))); }
export async function patchStage(db: AcademicStructureDb, actor: Actor, id: string, input: OrderedStructurePatch) { await manage(db, actor); if (!await repo.findStage(db, actor.schoolId, id)) notFound('Stage'); return view((await unique(() => repo.updateStage(db, actor.schoolId, id, input))) ?? notFound('Stage')); }

export async function listLevels(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE'> & { stageId?: string }) { await read(db, actor); const result = await repo.listLevels(db, actor.schoolId, paging(input), input); return page(result.rows.map(view), result.total, input); }
export async function getLevel(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findLevel(db, actor.schoolId, id); return view(row ?? notFound('Level')); }
export async function createLevel(db: AcademicStructureDb, actor: Actor, input: LevelCreate) { await manage(db, actor); if (!await repo.findStage(db, actor.schoolId, input.stageId)) notFound('Stage'); return view(await unique(() => repo.insertLevel(db, actor.schoolId, input))); }
export async function patchLevel(db: AcademicStructureDb, actor: Actor, id: string, input: LevelPatch) { await manage(db, actor); if (!await repo.findLevel(db, actor.schoolId, id)) notFound('Level'); if (input.stageId && !await repo.findStage(db, actor.schoolId, input.stageId)) notFound('Stage'); return view((await unique(() => repo.updateLevel(db, actor.schoolId, id, input))) ?? notFound('Level')); }

export async function listTracks(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE'>) { await read(db, actor); const result = await repo.listTracks(db, actor.schoolId, paging(input), input.status); return page(result.rows.map(view), result.total, input); }
export async function getTrack(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findTrack(db, actor.schoolId, id); return view(row ?? notFound('Track')); }
export async function createTrack(db: AcademicStructureDb, actor: Actor, input: OrderedStructureCreate) { await manage(db, actor); return view(await unique(() => repo.insertTrack(db, actor.schoolId, input))); }
export async function patchTrack(db: AcademicStructureDb, actor: Actor, id: string, input: OrderedStructurePatch) { await manage(db, actor); if (!await repo.findTrack(db, actor.schoolId, id)) notFound('Track'); return view((await unique(() => repo.updateTrack(db, actor.schoolId, id, input))) ?? notFound('Track')); }

export async function listSubjects(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE'> & { search?: string }) { await read(db, actor); const result = await repo.listSubjects(db, actor.schoolId, paging(input), input); return page(result.rows.map(view), result.total, input); }
export async function getSubject(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findSubject(db, actor.schoolId, id); return view(row ?? notFound('Subject')); }
export async function createSubject(db: AcademicStructureDb, actor: Actor, input: SubjectCreate) { await manage(db, actor); return view(await unique(() => repo.insertSubject(db, actor.schoolId, input))); }
export async function patchSubject(db: AcademicStructureDb, actor: Actor, id: string, input: SubjectPatch) { await manage(db, actor); if (!await repo.findSubject(db, actor.schoolId, id)) notFound('Subject'); return view((await unique(() => repo.updateSubject(db, actor.schoolId, id, input))) ?? notFound('Subject')); }

export async function listCurricula(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>) { await read(db, actor); const result = await repo.listCurricula(db, actor.schoolId, paging(input), input.status); return page(result.rows.map(view), result.total, input); }
export async function getCurriculum(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findCurriculum(db, actor.schoolId, id); return view(row ?? notFound('Curriculum')); }
export async function createCurriculum(db: AcademicStructureDb, actor: Actor, input: CurriculumCreate) { await manage(db, actor); if (input.status === 'ARCHIVED') assertTransition('curriculum', 'ACTIVE', input.status); return view(await unique(() => repo.insertCurriculum(db, actor.schoolId, input))); }
export async function patchCurriculum(db: AcademicStructureDb, actor: Actor, id: string, input: CurriculumPatch) { await manage(db, actor); const current = await repo.findCurriculum(db, actor.schoolId, id); if (!current) notFound('Curriculum'); if (input.status) assertTransition('curriculum', current.status, input.status); if (current.status === 'ARCHIVED' && input.name !== undefined) throw new AcademicStructureError('INVALID_STATUS_TRANSITION', 'An archived Curriculum is immutable.'); return view((await unique(() => repo.updateCurriculum(db, actor.schoolId, id, input))) ?? notFound('Curriculum')); }

export async function listCurriculumVersions(db: AcademicStructureDb, actor: Actor, curriculumId: string, input: PageInput & StatusFilter<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>) {
  await read(db, actor); if (!await repo.findCurriculum(db, actor.schoolId, curriculumId)) notFound('Curriculum');
  const result = await repo.listCurriculumVersions(db, actor.schoolId, curriculumId, paging(input), input.status); return page(result.rows.map(view), result.total, input);
}
export async function getCurriculumVersion(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findCurriculumVersion(db, actor.schoolId, id); return view(row ?? notFound('Curriculum version')); }
export async function createCurriculumVersion(db: AcademicStructureDb, actor: Actor, curriculumId: string, input: CurriculumVersionCreate) {
  await manage(db, actor); if (!await repo.findCurriculum(db, actor.schoolId, curriculumId)) notFound('Curriculum');
  if (input.status && input.status !== 'DRAFT') assertTransition('curriculum-version', 'DRAFT', input.status);
  return view(await unique(() => repo.insertCurriculumVersion(db, actor.schoolId, curriculumId, input)));
}
export async function patchCurriculumVersion(db: AcademicStructureDb, actor: Actor, id: string, input: CurriculumVersionPatch) {
  await manage(db, actor); const current = await repo.findCurriculumVersion(db, actor.schoolId, id); if (!current) notFound('Curriculum version');
  if (input.status) assertTransition('curriculum-version', current.status, input.status);
  if (input.name !== undefined && current.status !== 'DRAFT') throw new AcademicStructureError('CURRICULUM_VERSION_IMMUTABLE', 'Only a DRAFT CurriculumVersion may change its version name.');
  return view((await unique(() => repo.updateCurriculumVersion(db, actor.schoolId, id, input))) ?? notFound('Curriculum version'));
}

export async function listCurriculumSubjects(db: AcademicStructureDb, actor: Actor, versionId: string, input: PageInput & StatusFilter<'ACTIVE' | 'INACTIVE'>) {
  await read(db, actor); if (!await repo.findCurriculumVersion(db, actor.schoolId, versionId)) notFound('Curriculum version');
  const result = await repo.listCurriculumSubjects(db, actor.schoolId, versionId, paging(input), input.status); return page(result.rows, result.total, input);
}
export async function createCurriculumSubject(db: AcademicStructureDb, actor: Actor, versionId: string, input: CurriculumSubjectCreate) {
  await manage(db, actor); const version = await repo.findCurriculumVersion(db, actor.schoolId, versionId); if (!version) notFound('Curriculum version');
  if (version.status !== 'DRAFT') throw new AcademicStructureError('CURRICULUM_VERSION_IMMUTABLE', 'Subjects may only be attached to a DRAFT CurriculumVersion.');
  if (!await repo.findSubject(db, actor.schoolId, input.subjectId)) notFound('Subject');
  return view(await unique(() => repo.insertCurriculumSubject(db, actor.schoolId, versionId, input)));
}
export async function patchCurriculumSubject(db: AcademicStructureDb, actor: Actor, id: string, input: CurriculumSubjectPatch) {
  await manage(db, actor); const current = await repo.findCurriculumSubject(db, actor.schoolId, id); if (!current) notFound('Curriculum subject');
  const version = await repo.findCurriculumVersion(db, actor.schoolId, current.curriculumVersionId); if (!version) notFound('Curriculum version');
  if (version.status !== 'DRAFT') throw new AcademicStructureError('CURRICULUM_VERSION_IMMUTABLE', 'CurriculumSubject structure may only change while its version is DRAFT.');
  return view((await unique(() => repo.updateCurriculumSubject(db, actor.schoolId, id, input))) ?? notFound('Curriculum subject'));
}

export async function listClasses(db: AcademicStructureDb, actor: Actor, input: PageInput & StatusFilter<'ACTIVE' | 'CLOSED' | 'ARCHIVED'> & { academicYearId?: string; levelId?: string; stageId?: string; trackId?: string }) { await read(db, actor); const result = await repo.listClasses(db, actor.schoolId, paging(input), input); return page(result.rows, result.total, input); }
export async function getClass(db: AcademicStructureDb, actor: Actor, id: string) { await read(db, actor); const row = await repo.findClass(db, actor.schoolId, id); return row ?? notFound('Class'); }

async function assertClassRelations(db: AcademicStructureDb, actor: Actor, input: { academicYearId: string; levelId: string; trackId?: string | null; curriculumVersionId: string }) {
  if (!await repo.findAcademicYear(db, actor.schoolId, input.academicYearId)) notFound('Academic year');
  if (!await repo.findLevel(db, actor.schoolId, input.levelId)) notFound('Level');
  if (input.trackId && !await repo.findTrack(db, actor.schoolId, input.trackId)) notFound('Track');
  if (!await repo.findCurriculumVersion(db, actor.schoolId, input.curriculumVersionId)) notFound('Curriculum version');
}
export async function createClass(db: AcademicStructureDb, actor: Actor, input: ClassCreate) { await manage(db, actor); await assertClassRelations(db, actor, input); if (input.status && input.status !== 'ACTIVE') assertTransition('class', 'ACTIVE', input.status); const inserted = await unique(() => repo.insertClass(db, actor.schoolId, input)); return (await repo.findClass(db, actor.schoolId, inserted.id)) ?? notFound('Class'); }
export async function patchClass(db: AcademicStructureDb, actor: Actor, id: string, input: ClassPatch) {
  await manage(db, actor); const current = await repo.findClass(db, actor.schoolId, id); if (!current) notFound('Class');
  if (input.status) assertTransition('class', current.status, input.status);
  if (current.status === 'ARCHIVED' && Object.keys(input).some((key) => key !== 'status')) throw new AcademicStructureError('INVALID_STATUS_TRANSITION', 'An archived Class is immutable.');
  await assertClassRelations(db, actor, { academicYearId: current.academicYearId, levelId: input.levelId ?? current.levelId, trackId: input.trackId === undefined ? current.trackId : input.trackId, curriculumVersionId: input.curriculumVersionId ?? current.curriculumVersionId });
  await unique(() => repo.updateClass(db, actor.schoolId, id, input));
  return (await repo.findClass(db, actor.schoolId, id)) ?? notFound('Class');
}
