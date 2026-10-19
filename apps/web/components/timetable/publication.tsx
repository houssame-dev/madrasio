'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { Field, inputClassName, Modal } from '@/components/academic/ui';
import { PageContainer } from '@/components/ui/page-container';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import type { readPublished } from '@/lib/modules/timetable/application/publication';
import type { getDraft } from '@/lib/modules/timetable/application/builder';
import { conflictListSchema, loadProgress } from '@/lib/modules/timetable/domain/builder';

type PublishedData = Awaited<ReturnType<typeof readPublished>>;
type Schedule = PublishedData['schedules'][number];
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
function WeeklyPublication({ schedule }: { schedule: Schedule }) {
  const t = useTranslations('timetablePublication'), week = useTranslations('timetable');
  return <article className="min-w-0 space-y-3 rounded-lg border p-3">
    <h3 className="font-semibold" dir="auto">{schedule.className} · {schedule.periodName} · {schedule.yearName}</h3>
    <p>{t('revision')} {schedule.sequence} · {t('from')} <bdi dir="ltr">{schedule.effectiveFrom}</bdi> · {t('until')} <bdi dir="ltr">{schedule.effectiveUntil}</bdi></p>
    <p className="text-sm">{schedule.timezone}</p>
    {!schedule.lessons.length ? <p>{t('emptyReplacement')}</p> : null}
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{days.map((key, index) => {
      const lessons = schedule.lessons.filter(l => l.weekday === index + 1).sort((a, b) => a.start.localeCompare(b.start));
      return lessons.length ? <section key={key} className="min-w-0 space-y-2 rounded-md border p-3" aria-label={week(key)}><h4 className="font-semibold">{week(key)}</h4><ol className="space-y-3">{lessons.map(l => <li key={l.lessonKey} className="space-y-1 border-t pt-2"><p><bdi dir="ltr">{l.start}–{l.end}</bdi></p><p dir="auto">{l.subjectName}</p><p dir="auto">{l.teacherName}</p><p dir="auto">{l.roomName ?? t('noRoom')}</p></li>)}</ol></section> : null;
    })}</div>
  </article>;
}
export function PublishedTimetables({ embedded = false }: { embedded?: boolean }) {
  const context = useAppContext(), t = useTranslations('timetablePublication');
  const role = context.currentSchool?.role;
  const [date, setDate] = useState(''), [mode, setMode] = useState<'CLASS' | 'TEACHER'>('CLASS'), [entity, setEntity] = useState(''), [student, setStudent] = useState('');
  const allowed = role === 'SCHOOL_ADMIN' || role === 'TEACHER' || role === 'PARENT';
  const params = new URLSearchParams({ ...(date ? { date } : {}), ...(role === 'SCHOOL_ADMIN' && entity ? { [mode === 'CLASS' ? 'classId' : 'teacherId']: entity } : {}), ...(role === 'PARENT' && student ? { studentId: student } : {}) });
  const query = useQuery({ queryKey: ['timetable-published', context.currentSchool?.id, context.user.id, role, params.toString()], queryFn: () => apiRequest<{ data: PublishedData }>(`/api/v1/timetable/published?${params}`), enabled: allowed, retry: false });
  if (!allowed) return <AccessDeniedWithReturn />;
  const data = query.data?.data;
  const content = <section className="min-w-0 space-y-5" aria-label={t('title')}>
    <h1 className="text-2xl font-semibold">{t(role === 'TEACHER' ? 'myTitle' : role === 'PARENT' ? 'childrenTitle' : 'title')}</h1><p>{t('description')}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label={t('date')} htmlFor="published-date"><input type="date" id="published-date" className={inputClassName} value={date || data?.date || ''} onChange={e => setDate(e.target.value)} /></Field>
      {role === 'SCHOOL_ADMIN' ? <><Field label={t('view')} htmlFor="published-mode"><select className={inputClassName} id="published-mode" value={mode} onChange={e => { setMode(e.target.value === 'TEACHER' ? 'TEACHER' : 'CLASS'); setEntity(''); }}><option value="CLASS">{t('CLASS')}</option><option value="TEACHER">{t('TEACHER')}</option></select></Field>
        <Field label={t(mode === 'CLASS' ? 'class' : 'teacher')} htmlFor="published-entity"><select className={inputClassName} id="published-entity" value={entity} onChange={e => setEntity(e.target.value)}><option value="">{t('all')}</option>{(mode === 'CLASS' ? data?.classes : data?.teachers)?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field></> : null}
      {role === 'PARENT' ? <Field label={t('child')} htmlFor="published-child"><select className={inputClassName} id="published-child" value={student || data?.selectedStudentId || ''} onChange={e => setStudent(e.target.value)}>{data?.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field> : null}
    </div>
    {query.isPending ? <p role="status">{t('loading')}</p> : query.isError ? <p role="alert">{t('error')}</p> : data?.schedules.length ? data.schedules.map(p => <WeeklyPublication key={p.id} schedule={p} />) : <p>{t('empty')}</p>}
    <Button variant="outline" onClick={() => void query.refetch()}>{t('retry')}</Button>
    {role === 'SCHOOL_ADMIN' && data?.history.length ? <section aria-label={t('history')} className="space-y-3"><h2 className="text-xl font-semibold">{t('history')}</h2><p>{t('historyHelp')}</p>{data.history.map(p => <details key={p.id} className="rounded-md border p-3"><summary className="cursor-pointer">{t('revision')} {p.sequence} · {p.effectiveFrom} · {t(p.effectiveFrom > data.today ? 'scheduled' : p.effectiveUntil < data.today ? 'past' : 'published')}</summary><WeeklyPublication schedule={p} /></details>)}</section> : null}
    <p className="text-sm text-muted-foreground">{t('unchanged')}</p>
  </section>;
  return embedded ? content : <PageContainer variant="MANAGEMENT_WIDE">{content}</PageContainer>;
}
export function PublishDraft({ data, disabled }: { data: Awaited<ReturnType<typeof getDraft>>; disabled: boolean }) {
  const t = useTranslations('timetablePublication'), builder = useTranslations('timetableBuilder'), week = useTranslations('timetable'), cache = useQueryClient();
  const [open, setOpen] = useState(false), [date, setDate] = useState(''), [message, setMessage] = useState<'saved' | 'error' | 'conflict' | null>(null);
  const [details, setDetails] = useState<ReturnType<typeof conflictListSchema.parse>>([]);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const query = useQuery({ queryKey: ['timetable-published', 'publication-state', data.classRow.schoolId, data.classRow.id], queryFn: () => apiRequest<{ data: PublishedData }>(`/api/v1/timetable/published?classId=${data.classRow.id}`), retry: false });
  const mutation = useMutation({ mutationFn: (body: unknown) => apiRequest('/api/v1/timetable/published', { method: 'POST', body: JSON.stringify(body) }), retry: false });
  const state = query.data?.data;
  const afterLatest = state?.latestEffectiveFrom ? new Date(Date.parse(`${state.latestEffectiveFrom}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : '';
  const minimum = [data.period.startDate, state?.today ?? '', afterLatest].sort().at(-1)!;
  const effectiveFrom = date || minimum;
  const warnings = loadProgress(data.lessons, data.loads).filter(p => p.status !== 'COMPLETE' || p.durationMismatch);
  async function publish() {
    if (!state || !data.draft) return;
    const body = { academicYearId: data.classRow.academicYearId, academicPeriodId: data.period.id, classId: data.classRow.id, draftId: data.draft.id, expectedRevision: data.draft.revision, expectedSequence: state.latestSequence, effectiveFrom, confirm: true };
    const signature = JSON.stringify(body); if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    try { await mutation.mutateAsync({ ...body, requestKey: request.current.key }); setMessage('saved'); setOpen(false); setDetails([]); await cache.invalidateQueries({ queryKey: ['timetable-published'] }); }
    catch (error) { const parsed = conflictListSchema.safeParse(error instanceof ApiClientError && error.details && typeof error.details === 'object' && 'conflicts' in error.details ? error.details.conflicts : null); setDetails(parsed.success ? parsed.data : []); setMessage(parsed.success ? 'conflict' : 'error'); setOpen(false); }
  }
  return <section className="space-y-3 border-t pt-4" aria-label={t('publish')}>
    <Button className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={disabled || mutation.isPending || !data.draft || (!data.lessons.length && !state?.latestSequence) || !state || effectiveFrom > data.period.endDate || data.contextChanged} onClick={() => { setOpen(true); setMessage(null); }}>{t('publish')}</Button>
    {!data.draft || (!data.lessons.length && !state?.latestSequence) ? <p>{t('draftRequired')}</p> : null}
    {query.isError ? <p role="alert">{t('error')} <Button variant="outline" onClick={() => void query.refetch()}>{t('retry')}</Button></p> : null}
    {message ? <div role={message === 'saved' ? 'status' : 'alert'}><p>{t(message)}</p>{message !== 'saved' ? <Button variant="outline" onClick={() => { void cache.invalidateQueries({ queryKey: ['timetable-published'] }); void cache.invalidateQueries({ queryKey: ['timetable-draft'] }); }}>{t('retry')}</Button> : null}</div> : null}
    {details.length ? <ul role="alert">{details.map((c, i) => <li key={i}>{builder('conflict', { kind: builder(c.kind === 'ROOM' ? 'ROOM_CONFLICT' : c.kind), className: c.otherClass, period: c.otherPeriod, day: week(days[c.weekday - 1]), start: c.start, end: c.end })}</li>)}</ul> : null}
    <Modal open={open} title={t('confirm')} onClose={() => { if (!mutation.isPending) setOpen(false); }}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void publish(); }}><p>{t('confirmHelp')}</p><p>{t('datesHelp')}</p>
      {!data.lessons.length ? <p role="alert">{t('emptyReplacement')}</p> : null}
      <Field label={t('from')} htmlFor="publication-from"><input required type="date" id="publication-from" min={minimum} max={data.period.endDate} className={inputClassName} disabled={mutation.isPending} value={effectiveFrom} onChange={e => setDate(e.target.value)} /></Field>
      {warnings.length ? <><p role="status">{t('warnings')}</p><ul>{warnings.map(p => <li key={p.subjectId}>{data.subjects.find(s => s.id === p.subjectId)?.name} · {builder('count', { scheduled: String(p.scheduled), required: String(p.required), minutes: String(p.scheduledMinutes), requiredMinutes: String(p.requiredMinutes) })}</li>)}</ul></> : null}
      <Button className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={mutation.isPending || disabled}>{t('confirm')}</Button>
    </form></Modal>
  </section>;
}
