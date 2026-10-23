'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { Field, inputClassName, Modal } from '@/components/academic/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import type { state } from '@/lib/modules/timetable/application/service';
import type { getDraft } from '@/lib/modules/timetable/application/builder';
import { conflictListSchema, lessonSchema, loadProgress, occurrences, schedulingConflicts, validateLessons, type Lesson, type SchedulingConflict } from '@/lib/modules/timetable/domain/builder';
import { PublishDraft } from './publication';

type State = Awaited<ReturnType<typeof state>>;
type Data = Awaited<ReturnType<typeof getDraft>>;
type Copy = ReturnType<typeof useTranslations<'timetableBuilder'>>;
const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const slotKey = (weekday: number, start: string, end: string) => `${weekday}|${start}|${end}`;

export function TimetableBuilder({ data, schoolId, onDirtyChange }: { data: State; schoolId: string; onDirtyChange: (dirty: boolean) => void }) {
  const t = useTranslations('timetableBuilder');
  const [periodId, setPeriodId] = useState(data.periods?.find(p => p.status === 'ACTIVE')?.id ?? data.periods?.[0]?.id ?? '');
  const [classId, setClassId] = useState(data.classes.find(c => c.status === 'ACTIVE')?.id ?? data.classes[0]?.id ?? '');
  const [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  const changed = useCallback((value: boolean) => { setDirty(value); if (value) setSaved(false); onDirtyChange(value); }, [onDirtyChange]);
  const query = useQuery({ queryKey: ['timetable-draft', schoolId, data.selectedYearId, periodId, classId],
    queryFn: () => apiRequest<{ data: Data }>(`/api/v1/timetable/draft?${new URLSearchParams({ academicYearId: data.selectedYearId!, academicPeriodId: periodId, classId })}`),
    enabled: !!data.selectedYearId && !!periodId && !!classId, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <section className="space-y-5" aria-label={t('title')}>
    <h2 className="text-xl font-semibold">{t('title')}</h2><p>{t('description')}</p>
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
      <Field label={t('period')} htmlFor="builder-period"><select id="builder-period" className={inputClassName} value={periodId} disabled={dirty || query.isFetching} onChange={e => { setPeriodId(e.target.value); setSaved(false); }}><option value="">{t('select')}</option>{data.periods?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label={t('class')} htmlFor="builder-class"><select id="builder-class" className={inputClassName} value={classId} disabled={dirty || query.isFetching} onChange={e => { setClassId(e.target.value); setSaved(false); }}><option value="">{t('select')}</option>{data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    </div>
    {saved ? <p role="status">{t('saved')}</p> : null}
    {!periodId || !classId ? <p>{t('contextMissing')}</p> : query.isPending ? <p role="status">{t('loading')}</p> : query.isError || !query.data ? <div role="alert"><p>{t('error')}</p><Button onClick={() => void query.refetch()}>{t('reload')}</Button></div> :
      <DraftEditor key={`${classId}:${periodId}:${query.dataUpdatedAt}`} data={query.data.data} busy={query.isFetching} changed={changed} onSaved={() => setSaved(true)} reload={async () => { await query.refetch(); }} />}
  </section>;
}
function DraftEditor({ data, busy, changed, reload, onSaved }: { data: Data; busy: boolean; changed: (dirty: boolean) => void; reload: () => Promise<void>; onSaved: () => void }) {
  const t = useTranslations('timetableBuilder'), week = useTranslations('timetable'), ui = useTranslations('timetableUi');
  const [lessons, setLessons] = useState<Lesson[]>(data.lessons), [configuration, setConfiguration] = useState(data.configuration);
  const [dirty, setDirty] = useState(false), [editing, setEditing] = useState<Lesson | null>(null);
  const [message, setMessage] = useState<'error' | 'invalid' | 'stale' | 'saved' | null>(null);
  const [serverConflicts, setServerConflicts] = useState<SchedulingConflict[]>([]);
  const request = useRef<{ signature: string; requestKey: string } | null>(null);
  const mutation = useMutation({ mutationFn: (body: unknown) => apiRequest('/api/v1/timetable/draft', { method: 'PUT', body: JSON.stringify(body) }), retry: false });
  useEffect(() => { changed(dirty); }, [dirty, changed]);
  useEffect(() => () => changed(false), [changed]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const onLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.href === window.location.href) return;
      if (!window.confirm(ui('discardPrompt'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', onLink, true); };
  }, [dirty, ui]);
  const disabled = busy || mutation.isPending || !data.editable;
  const dayName = (day: number) => week(dayKeys[day - 1]);
  const subjectName = (id: string) => data.subjects.find(s => s.id === id)?.name ?? t('unnamed');
  const issues = validateLessons(lessons, data, configuration, data.period.startDate, data.period.endDate);
  const candidates = lessons.map(l => ({ ...l, teacherId: data.assignments.find(a => a.id === l.teacherAssignmentId)?.teacherId ?? l.teacherAssignmentId, classId: data.classRow.id, className: data.classRow.name, periodName: data.period.name, startDate: data.period.startDate, endDate: data.period.endDate }));
  const conflicts = [...schedulingConflicts(candidates, data.others), ...serverConflicts];
  const progress = loadProgress(lessons, data.loads);
  const offGrid = lessons.filter(l => !configuration?.days.some(d => d.day === l.weekday && d.slots.some(s => s.kind === 'LESSON' && s.start === l.start && s.end === l.end)));
  function edit(values: Lesson[]) { setLessons(values); setDirty(true); setMessage(null); setServerConflicts([]); }
  async function save() {
    if (!configuration) return;
    const body = { academicYearId: data.classRow.academicYearId, academicPeriodId: data.period.id, classId: data.classRow.id,
      configurationId: configuration.id, curriculumVersionId: data.classRow.curriculumVersionId, startDate: data.period.startDate, endDate: data.period.endDate,
      expectedRevision: data.draft?.revision ?? 0, lessons };
    const signature = JSON.stringify({ ...body, lessons: [...lessons].sort((a, b) => a.lessonKey.localeCompare(b.lessonKey)) });
    if (request.current?.signature !== signature) request.current = { signature, requestKey: crypto.randomUUID() };
    try { await mutation.mutateAsync({ ...body, requestKey: request.current.requestKey }); setDirty(false); setMessage(null); changed(false); onSaved(); await reload(); }
    catch (error) {
      let scheduling = false;
      if (error instanceof ApiClientError && typeof error.details === 'object' && error.details !== null && 'conflicts' in error.details) {
        const parsed = conflictListSchema.safeParse(error.details.conflicts); if (parsed.success && parsed.data.length) { setServerConflicts(parsed.data); scheduling = true; }
      }
      setMessage(scheduling ? null : error instanceof ApiClientError && error.status === 409 ? 'stale' : 'error');
    }
  }
  function card(l: Lesson) {
    const assignment = data.assignments.find(a => a.id === l.teacherAssignmentId), teacher = data.teachers.find(v => v.id === assignment?.teacherId);
    return <article key={l.lessonKey} className="min-w-0 space-y-2 break-words rounded-md border bg-background p-3">
      <h4 className="font-semibold" dir="auto">{subjectName(l.subjectId)}</h4><p className="text-lg font-semibold tabular-nums"><bdi dir="ltr">{l.start}–{l.end}</bdi></p>
      <p dir="auto">{teacher ? `${teacher.firstName} ${teacher.lastName}` : t('unnamed')}</p><p dir="auto">{data.rooms.find(r => r.id === l.roomId)?.name ?? t('noRoom')}</p>
      {issues.filter(i => i.lessonKey === l.lessonKey).map(i => <p key={i.kind} className="text-sm">{t(i.kind)}</p>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={disabled} onClick={() => setEditing(l)} aria-label={`${t('edit')} · ${subjectName(l.subjectId)} · ${dayName(l.weekday)} ${l.start}`}>{t('edit')}</Button>
        <Button type="button" variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={disabled} onClick={() => edit(lessons.filter(v => v.lessonKey !== l.lessonKey))} aria-label={`${t('remove')} · ${subjectName(l.subjectId)} · ${dayName(l.weekday)} ${l.start}`}>{t('remove')}</Button></div>
    </article>;
  }
  return <div className="space-y-5" aria-busy={busy || mutation.isPending}>
    <p className="rounded-md border bg-card p-3 text-sm font-medium">{ui('draftOnly')}</p>
    <p>{data.draft ? `${t('revision')} ${data.draft.revision}` : t('newDraft')} · {t('dates')}: <bdi dir="ltr">{data.period.startDate} – {data.period.endDate}</bdi></p>
    <p className="text-sm text-muted-foreground">{t('history')}</p>{!data.editable ? <p role="status">{t('readonly')}</p> : null}
    {data.contextChanged ? <p role="status" className="rounded-md border p-3">{t('contextChanged')}</p> : null}
    {configuration?.id !== data.effectiveConfiguration?.id ? <div role="status" className="space-y-2 rounded-md border p-3"><p>{t('configurationChanged')}</p>{data.effectiveConfiguration ? <Button disabled={disabled} variant="outline" onClick={() => { setConfiguration(data.effectiveConfiguration); setDirty(true); setServerConflicts([]); }}>{t('useLatest')}</Button> : null}</div> : null}
    {!configuration ? <p>{t('noConfiguration')}</p> : null}
    {dirty ? <p role="status" className="rounded-md border bg-accent p-3 text-sm font-medium text-accent-foreground">{t('unsaved')}</p> : null}{message ? <p role={message === 'saved' ? 'status' : 'alert'}>{t(message)}</p> : null}
    {conflicts.length ? <section role="alert" className="space-y-2 break-words rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive"><h3 className="font-semibold">{t('conflictTitle')}</h3><p>{t('conflictHelp')}</p><ul>{conflicts.map((c, index) => <li key={index}>{t('conflict', { kind: t(c.kind === 'ROOM' ? 'ROOM_CONFLICT' : c.kind), className: c.otherClass, period: c.otherPeriod, day: dayName(c.weekday), start: c.start, end: c.end })}</li>)}</ul></section> : null}
    {issues.length ? <p role="alert">{t('invalidLessons')}</p> : null}
    {!lessons.length ? <p>{t('empty')}</p> : null}
    <section aria-label={t('grid')} className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {configuration?.days.map(d => <section key={d.day} aria-label={dayName(d.day)} className="min-w-0 space-y-3 rounded-lg border bg-card p-4"><h3 className="font-semibold">{dayName(d.day)}</h3><ol className="space-y-3">{d.slots.map(s => <li key={slotKey(d.day, s.start, s.end)} className="space-y-2">
        <p className="text-sm font-semibold tabular-nums"><bdi dir="ltr">{s.start}–{s.end}</bdi>{s.kind === 'BREAK' ? ` · ${t('break')}` : ''}</p>
        {s.kind === 'LESSON' ? <>{lessons.filter(l => l.weekday === d.day && l.start === s.start && l.end === s.end).map(card)}<Button type="button" className="w-full" variant="outline" disabled={disabled} aria-label={`${t('add')} · ${dayName(d.day)} ${s.start}–${s.end}`} onClick={() => setEditing({ lessonKey: crypto.randomUUID(), weekday: d.day, start: s.start, end: s.end, subjectId: '', teacherAssignmentId: '', roomId: null })}>{t('add')}</Button></> : null}
      </li>)}</ol></section>)}
    </section>
    {offGrid.length ? <section aria-label={t('offGrid')} className="space-y-3"><h3 className="font-semibold">{t('offGrid')}</h3>{offGrid.map(card)}</section> : null}
    <section aria-label={t('progress')} className="space-y-2"><h3 className="text-lg font-semibold">{t('progress')}</h3><p>{t('progressNotice')}</p>{!progress.length ? <p>{t('noRequirements')}</p> : <ul className="grid gap-3 sm:grid-cols-2">{progress.map(p => <li key={p.subjectId} className="space-y-1 rounded-md border bg-card p-3"><p dir="auto" className="font-semibold">{subjectName(p.subjectId)}</p><p>{t('count', { scheduled: String(p.scheduled), required: String(p.required), minutes: String(p.scheduledMinutes), requiredMinutes: String(p.requiredMinutes) })}</p><p>{t(p.status)}</p>{p.durationMismatch ? <p>{t('durationMismatch')}</p> : null}</li>)}</ul>}</section>
    <div className="flex flex-wrap gap-3"><Button disabled={disabled || !dirty || !configuration || !!issues.length || !!conflicts.length} onClick={() => void save()}>{mutation.isPending ? ui('saving') : t('save')}</Button>
      <Button variant="outline" disabled={busy || mutation.isPending} onClick={() => void reload()}>{t(dirty ? 'discard' : 'reload')}</Button></div>
    <PublishDraft data={data} disabled={disabled || dirty || !!issues.length} />
    <Modal open={!!editing} title={t('edit')} onClose={() => setEditing(null)}>{editing && configuration ? <LessonForm key={editing.lessonKey} value={editing} data={data} configuration={configuration} t={t} dayName={dayName} onApply={l => { edit([...lessons.filter(v => v.lessonKey !== l.lessonKey), l]); setEditing(null); }} /> : null}</Modal>
  </div>;
}
function LessonForm({ value, data, configuration, t, dayName, onApply }: { value: Lesson; data: Data; configuration: NonNullable<Data['configuration']>; t: Copy; dayName: (day: number) => string; onApply: (lesson: Lesson) => void }) {
  const [lesson, setLesson] = useState(value), [invalid, setInvalid] = useState(false);
  const slots = configuration.days.flatMap(d => d.slots.filter(s => s.kind === 'LESSON').map(s => ({ ...s, weekday: d.day })));
  const subjects = data.subjects.filter(s => s.status === 'ACTIVE' && data.curriculumSubjects.some(c => c.subjectId === s.id && c.status === 'ACTIVE'));
  const dates = occurrences(data.period.startDate, data.period.endDate, lesson.weekday);
  const assignments = data.assignments.filter(a => a.subjectId === lesson.subjectId && a.status === 'ACTIVE' && data.teachers.some(t => t.id === a.teacherId && t.status === 'ACTIVE') && dates && a.effectiveFrom <= dates.first && (!a.effectiveUntil || a.effectiveUntil >= dates.last));
  const rooms = data.rooms.filter(r => r.active);
  function submit(e: FormEvent) { e.preventDefault(); if (!lessonSchema.safeParse(lesson).success || validateLessons([lesson], data, configuration, data.period.startDate, data.period.endDate).length) { setInvalid(true); return; } onApply(lesson); }
  return <form className="space-y-4" onSubmit={submit}>
    {invalid ? <p role="alert">{t('invalid')}</p> : null}
    <Field label={t('slot')} htmlFor="lesson-slot"><select id="lesson-slot" className={inputClassName} required value={slotKey(lesson.weekday, lesson.start, lesson.end)} onChange={e => { const selected = slots.find(s => slotKey(s.weekday, s.start, s.end) === e.target.value); if (selected) setLesson(l => ({ ...l, weekday: selected.weekday, start: selected.start, end: selected.end })); }}>
      {!slots.some(s => slotKey(s.weekday, s.start, s.end) === slotKey(lesson.weekday, lesson.start, lesson.end)) ? <option disabled value={slotKey(lesson.weekday, lesson.start, lesson.end)}>{t('SLOT')}</option> : null}
      {slots.map(s => <option key={slotKey(s.weekday, s.start, s.end)} value={slotKey(s.weekday, s.start, s.end)}>{dayName(s.weekday)} {s.start}–{s.end}</option>)}
    </select></Field>
    <Field label={t('subject')} htmlFor="lesson-subject"><select id="lesson-subject" className={inputClassName} required value={lesson.subjectId} onChange={e => setLesson(l => ({ ...l, subjectId: e.target.value, teacherAssignmentId: '' }))}><option value="">{t('select')}</option>{!subjects.some(s => s.id === lesson.subjectId) && lesson.subjectId ? <option disabled value={lesson.subjectId}>{t('SUBJECT')}</option> : null}{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label={t('assignment')} htmlFor="lesson-assignment"><select id="lesson-assignment" className={inputClassName} required value={lesson.teacherAssignmentId} onChange={e => setLesson(l => ({ ...l, teacherAssignmentId: e.target.value }))}><option value="">{t('select')}</option>{lesson.teacherAssignmentId && !assignments.some(a => a.id === lesson.teacherAssignmentId) ? <option disabled value={lesson.teacherAssignmentId}>{t('ASSIGNMENT')}</option> : null}{assignments.map(a => { const teacher = data.teachers.find(v => v.id === a.teacherId)!; return <option key={a.id} value={a.id}>{teacher.firstName} {teacher.lastName} · {a.effectiveFrom} – {a.effectiveUntil ?? data.period.endDate}</option>; })}</select></Field>
    {!assignments.length ? <p>{t('noAssignment')}</p> : null}
    <Field label={t('room')} htmlFor="lesson-room"><select id="lesson-room" className={inputClassName} value={lesson.roomId ?? ''} onChange={e => setLesson(l => ({ ...l, roomId: e.target.value || null }))}><option value="">{t('noRoom')}</option>{lesson.roomId && !rooms.some(r => r.id === lesson.roomId) ? <option disabled value={lesson.roomId}>{t('ROOM')}</option> : null}{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
    <Button>{t('apply')}</Button>
  </form>;
}
