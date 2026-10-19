import 'server-only';
import { createHash } from 'node:crypto';
import { BusinessRuleViolationError, ConflictError, NotFoundError } from '@/lib/errors';
import { authorize, write, audit, type Actor, type TimetableDb } from './service';
import * as repo from '../infrastructure/builder-repository';
import { effectiveConfiguration, minutes } from '../domain/contracts';
import { draftContextSchema, draftSchema, validateLessons, schedulingConflicts, loadProgress, type Lesson, type Reservation } from '../domain/builder';
type Context = Awaited<ReturnType<typeof repo.context>>;
function assertContext(c: Context) {
  if (!c.year || !c.period || !c.classRow || !c.level) throw new NotFoundError();
  if (c.period.startDate < c.year.startDate || c.period.endDate > c.year.endDate) throw new BusinessRuleViolationError('Academic Period dates must be within the Academic Year.');
}
function editable(c: Context) { return !!c.year && ['PLANNED', 'ACTIVE'].includes(c.year.status) && c.period?.status !== 'CLOSED' && c.classRow?.status === 'ACTIVE'; }
function candidateReservations(lessons: Lesson[], c: Context, startDate: string, endDate: string): Reservation[] {
  return lessons.map(l => ({ ...l, classId: c.classRow!.id, className: c.classRow!.name, periodName: c.period!.name, teacherId: c.assignments.find(a => a.id === l.teacherAssignmentId)?.teacherId ?? l.teacherAssignmentId, startDate, endDate }));
}
export async function getDraft(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = draftContextSchema.parse(raw); await authorize(db, actor);
  return db.transaction(async tx => {
    const c = await repo.context(tx, actor.schoolId, input, false); assertContext(c);
    const draft = await repo.latest(tx, actor.schoolId, input);
    const effective = effectiveConfiguration(c.configs, c.level!.stageId, c.classRow!.levelId);
    const pinned = draft ? await repo.configuration(tx, actor.schoolId, input.academicYearId, draft.configurationId) : effective;
    const lessons = draft ? await repo.lessons(tx, actor.schoolId, draft.id) : [];
    const others = await repo.reservations(tx, actor.schoolId, input, c.period!.startDate, c.period!.endDate);
    return { draft, lessons, configuration: pinned ?? null, effectiveConfiguration: effective ?? null, period: c.period!, classRow: c.classRow!,
      configurationChanged: !!draft && pinned?.id !== effective?.id,
      contextChanged: !!draft && (draft.startDate !== c.period!.startDate || draft.endDate !== c.period!.endDate || draft.curriculumVersionId !== c.classRow!.curriculumVersionId),
      subjects: c.subjects, curriculumSubjects: c.curriculumSubjects, assignments: c.assignments, teachers: c.teachers, rooms: c.rooms, loads: c.loads, others,
      progress: loadProgress(lessons, c.loads), issues: validateLessons(lessons, c, pinned, c.period!.startDate, c.period!.endDate),
      conflicts: schedulingConflicts(candidateReservations(lessons, c, c.period!.startDate, c.period!.endDate), others), editable: editable(c) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function saveDraft(db: TimetableDb, actor: Actor, raw: unknown) {
  const input = draftSchema.parse(raw);
  return write(db, actor, async tx => {
    const normalized = { ...input, lessons: [...input.lessons].sort((a, b) => a.lessonKey.localeCompare(b.lessonKey)) };
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const old = await repo.previousRequest(tx, actor.schoolId, input.requestKey);
    if (old) { if (old.requestHash !== hash) throw new ConflictError('Idempotency key reused with different draft.'); return { id: old.id, revision: old.revision }; }
    const c = await repo.context(tx, actor.schoolId, input, true); assertContext(c);
    if (!editable(c)) throw new BusinessRuleViolationError('Academic context is closed.');
    if (input.startDate !== c.period!.startDate || input.endDate !== c.period!.endDate || input.curriculumVersionId !== c.classRow!.curriculumVersionId) throw new ConflictError('Academic context changed; reload and review.', { kind: 'CONTEXT_CHANGED' });
    const current = await repo.latest(tx, actor.schoolId, input);
    if ((current?.revision ?? 0) !== input.expectedRevision) throw new ConflictError('Draft changed; reload before editing.', { kind: 'STALE_DRAFT' });
    const effective = effectiveConfiguration(c.configs, c.level!.stageId, c.classRow!.levelId);
    if (input.configurationId !== effective?.id && input.configurationId !== current?.configurationId) throw new ConflictError('Teaching week changed; reload and review.', { kind: 'CONTEXT_CHANGED' });
    const configuration = await repo.configuration(tx, actor.schoolId, input.academicYearId, input.configurationId);
    const issues = validateLessons(input.lessons, c, configuration, input.startDate, input.endDate);
    if (!configuration || issues.length) throw new BusinessRuleViolationError('Correct invalid lessons before saving.', { kind: 'LESSON_INVALID', issues });
    const others = await repo.reservations(tx, actor.schoolId, input, input.startDate, input.endDate);
    const conflicts = schedulingConflicts(candidateReservations(input.lessons, c, input.startDate, input.endDate), others);
    if (conflicts.length) throw new ConflictError('Scheduling conflicts must be resolved before saving.', { kind: 'SCHEDULING_CONFLICT', conflicts });
    const saved = await repo.insert(tx, { schoolId: actor.schoolId, academicYearId: input.academicYearId, academicPeriodId: input.academicPeriodId, classId: input.classId,
      curriculumVersionId: input.curriculumVersionId, configurationId: input.configurationId, startDate: input.startDate, endDate: input.endDate,
      revision: (current?.revision ?? 0) + 1, requestKey: input.requestKey, requestHash: hash, createdBy: actor.userId! }, input.lessons.map(l => ({ schoolId: actor.schoolId,
        academicYearId: input.academicYearId, classId: input.classId, lessonKey: l.lessonKey, weekday: l.weekday, startMinute: minutes(l.start), endMinute: minutes(l.end),
        subjectId: l.subjectId, teacherAssignmentId: l.teacherAssignmentId, teacherId: c.assignments.find(a => a.id === l.teacherAssignmentId)!.teacherId, roomId: l.roomId })));
    await audit(tx, actor, saved.id, 'TimetableDraftSaved', saved.revision, { lessonCount: String(input.lessons.length), periodId: input.academicPeriodId, classId: input.classId });
    return { id: saved.id, revision: saved.revision };
  });
}
