'use client';
import { HolidayState } from '@/components/academic/holiday-state';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { Field, inputClassName, Modal } from '@/components/academic/ui';
import './timetable.css';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import type { readPublished } from '@/lib/modules/timetable/application/publication';
import type { getDraft } from '@/lib/modules/timetable/application/builder';
import { conflictListSchema, loadProgress } from '@/lib/modules/timetable/domain/builder';

type PublishedData = Awaited<ReturnType<typeof readPublished>>;
type Schedule = PublishedData['schedules'][number];
const calendarDay = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
function TeacherWeek({ schedules, showTeacher, selectedDay, focusDay }: { schedules: Schedule[]; showTeacher: boolean; selectedDay: number; focusDay: number }) {
  const t = useTranslations('timetablePublication'), week = useTranslations('timetable'), ui = useTranslations('timetableUi');
  const lessons = schedules.flatMap(schedule => schedule.lessons.map(lesson => ({ schedule, lesson })));
  if (!lessons.length) return <p>{t('emptyReplacement')}</p>;
  if (selectedDay && !lessons.some(({ lesson }) => lesson.weekday === selectedDay)) return <p role="status" className="rounded-lg border border-dashed bg-card p-5">{ui('noLessonsForDay')}</p>;
  return <div className="tt-published-days">{days.map((key, index) => {
    if (selectedDay && selectedDay !== index + 1) return null;
    const daily = lessons.filter(({ lesson }) => lesson.weekday === index + 1).sort((a, b) =>
      a.lesson.start.localeCompare(b.lesson.start) || a.lesson.end.localeCompare(b.lesson.end) || a.schedule.className.localeCompare(b.schedule.className) || a.lesson.lessonKey.localeCompare(b.lesson.lessonKey));
    return daily.length ? <section key={key} className={`min-w-0 space-y-3 rounded-lg border bg-card p-4 ${focusDay === index + 1 ? 'border-primary' : ''}`} aria-label={week(key)}>
      <h2 className="text-lg font-semibold">{week(key)}</h2>{focusDay === index + 1 ? <p className="text-xs font-medium text-muted-foreground">{ui('selectedDay')}</p> : null}
      <ol className="space-y-3">{daily.map(({ schedule, lesson }) => <li key={`${schedule.id}:${lesson.lessonKey}`} className="min-w-0 space-y-2 break-words border-t pt-3">
        <p className="text-lg font-semibold tabular-nums"><bdi dir="ltr">{lesson.start}–{lesson.end}</bdi></p>
        <dl className="space-y-1">
          <div><dt className="inline text-muted-foreground">{t('class')}: </dt><dd className="inline"><bdi>{schedule.className}</bdi></dd></div>
          <div><dt className="inline text-muted-foreground">{week('subject')}: </dt><dd className="inline"><bdi>{lesson.subjectName}</bdi></dd></div>
          <div><dt className="inline text-muted-foreground">{week('ROOM')}: </dt><dd className="inline"><bdi>{lesson.roomName ?? t('noRoom')}</bdi></dd></div>
          {showTeacher ? <div><dt className="inline text-muted-foreground">{t('teacher')}: </dt><dd className="inline"><bdi>{lesson.teacherName}</bdi></dd></div> : null}
        </dl>
        <p className="text-sm text-muted-foreground"><bdi>{schedule.periodName} · {schedule.yearName} · {schedule.timezone}</bdi></p>
        <p className="text-sm text-muted-foreground">{t('revision')} {schedule.sequence} · {t('from')} <bdi dir="ltr">{schedule.effectiveFrom}</bdi> · {t('until')} <bdi dir="ltr">{schedule.effectiveUntil}</bdi></p>
      </li>)}</ol>
    </section> : null;
  })}</div>;
}
function WeeklyPublication({ schedule, selectedDay = 0, weekly=false }: { schedule: Schedule; selectedDay?: number; weekly?:boolean }) {
  const t = useTranslations('timetablePublication'), week = useTranslations('timetable'), ui = useTranslations('timetableUi');
  return <article className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
    <h3 className="font-semibold" dir="auto">{schedule.className} · {schedule.periodName} · {schedule.yearName}</h3>
    <p>{t('revision')} {schedule.sequence} · {t('from')} <bdi dir="ltr">{schedule.effectiveFrom}</bdi> · {t('until')} <bdi dir="ltr">{schedule.effectiveUntil}</bdi></p>
    <p className="text-sm">{schedule.timezone}</p>
    {!schedule.lessons.length ? <p>{t('emptyReplacement')}</p> : null}
    {selectedDay && schedule.lessons.length > 0 && !schedule.lessons.some(l => l.weekday === selectedDay) ? <p role="status" className="rounded-md border border-dashed p-4">{ui('noLessonsForDay')}</p> : null}
    {weekly?<PublishedGrid schedule={schedule} selectedDay={selectedDay} />:<div className="tt-published-week">{days.map((key, index) => {
      if (selectedDay && selectedDay !== index + 1) return null;
      const lessons = schedule.lessons.filter(l => l.weekday === index + 1).sort((a, b) => a.start.localeCompare(b.start));
      return lessons.length ? <section key={key} className="min-w-0 space-y-2 rounded-md border p-3" aria-label={week(key)}><h4 className="font-semibold">{week(key)}</h4><ol className="space-y-3">{lessons.map(l => <li key={l.lessonKey} className="min-w-0 space-y-1 break-words border-t pt-3"><p className="text-lg font-semibold tabular-nums"><bdi dir="ltr">{l.start}–{l.end}</bdi></p><p className="font-semibold"><bdi>{l.subjectName}</bdi></p><p className="text-sm"><span className="text-muted-foreground">{t('teacher')}: </span><bdi>{l.teacherName}</bdi></p><p className="text-sm"><span className="text-muted-foreground">{week('ROOM')}: </span><bdi>{l.roomName ?? t('noRoom')}</bdi></p></li>)}</ol></section> : null;
    })}</div>}
  </article>;
}
function PublishedGrid({schedule,selectedDay}:{schedule:Schedule;selectedDay:number}){
 const t=useTranslations('timetablePublication'),week=useTranslations('timetable');
 const weekdays=days.map((key,index)=>({key,day:index+1})).filter(d=>selectedDay?selectedDay===d.day:schedule.lessons.some(l=>l.weekday===d.day));
 const times=[...new Map(schedule.lessons.map(l=>[`${l.start}|${l.end}`,l])).values()].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
 return <div className="tt-read-grid tt-week-scroll" role="group" tabIndex={0} aria-label={t('title')}><table><thead><tr><th scope="col">{week('start')}</th>{weekdays.map(d=><th key={d.day} scope="col">{week(d.key)}</th>)}</tr></thead><tbody>{times.map(time=><tr key={`${time.start}|${time.end}`}><th scope="row"><bdi dir="ltr">{time.start}–{time.end}</bdi></th>{weekdays.map(d=><td key={d.day} data-empty={!schedule.lessons.some(l=>l.weekday===d.day&&l.start===time.start&&l.end===time.end)}><p className="tt-read-mobile"><span>{week(d.key)}</span> · <bdi dir="ltr">{time.start}–{time.end}</bdi></p>{schedule.lessons.filter(l=>l.weekday===d.day&&l.start===time.start&&l.end===time.end).map(l=><div className="tt-lesson" key={l.lessonKey}><strong><bdi>{l.subjectName}</bdi></strong><p><bdi>{l.teacherName}</bdi></p><p><bdi>{l.roomName??t('noRoom')}</bdi></p></div>)}</td>)}</tr>)}</tbody></table></div>;
}
export function PublishedTimetables({ embedded = false }: { embedded?: boolean }) {
  const context = useAppContext(), t = useTranslations('timetablePublication'), week = useTranslations('timetable'), ui = useTranslations('timetableUi');
  const [selectedDay, setSelectedDay] = useState(0);
  const Heading = embedded ? 'h2' : 'h1';
  const role = context.currentSchool?.role;
  const searchParams = useSearchParams();
  const [date, setDate] = useState(() => { const value = role === 'PARENT' ? searchParams?.get('date') : null; return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''; }), [mode, setMode] = useState<'CLASS' | 'TEACHER'>('CLASS'), [entity, setEntity] = useState(''), [student, setStudent] = useState(() => { const value = role === 'PARENT' ? searchParams?.get('studentId') : null; return value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : ''; });
  const allowed = role === 'SCHOOL_ADMIN' || role === 'TEACHER' || role === 'PARENT';
  const params = new URLSearchParams({ ...(date ? { date } : {}), ...(role === 'SCHOOL_ADMIN' && entity ? { [mode === 'CLASS' ? 'classId' : 'teacherId']: entity } : {}), ...(role === 'PARENT' && student ? { studentId: student } : {}) });
  const query = useQuery({ queryKey: ['timetable-published', context.currentSchool?.id, context.user.id, role, params.toString()], queryFn: () => apiRequest<{ data: PublishedData }>(`/api/v1/timetable/published?${params}`), enabled: allowed, retry: false });
  if (!allowed) return <AccessDeniedWithReturn />;
  const data = query.data?.data;
  const content = <section className="min-w-0 space-y-5" aria-label={t('title')}>
    <Heading className="text-2xl font-semibold">{t(role === 'TEACHER' ? 'myTitle' : role === 'PARENT' ? 'childrenTitle' : 'title')}</Heading><p className="text-sm text-muted-foreground">{t('description')}</p>
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 [&_input]:min-w-0 [&_select]:min-w-0"><Field label={t('date')} htmlFor="published-date"><input type="date" dir="ltr" id="published-date" className={inputClassName} value={date || data?.date || ''} onChange={e => setDate(e.target.value)} /></Field>
      {role === 'SCHOOL_ADMIN' ? <><Field label={t('view')} htmlFor="published-mode"><select className={inputClassName} id="published-mode" value={mode} onChange={e => { setMode(e.target.value === 'TEACHER' ? 'TEACHER' : 'CLASS'); setEntity(''); }}><option value="CLASS">{t('CLASS')}</option><option value="TEACHER">{t('TEACHER')}</option></select></Field>
        <Field label={t(mode === 'CLASS' ? 'class' : 'teacher')} htmlFor="published-entity"><select className={inputClassName} id="published-entity" value={entity} onChange={e => setEntity(e.target.value)}><option value="">{t('all')}</option>{(mode === 'CLASS' ? data?.classes : data?.teachers)?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field></> : null}
      {role === 'PARENT' ? <Field label={t('child')} htmlFor="published-child"><select className={inputClassName} id="published-child" value={student || data?.selectedStudentId || ''} onChange={e => setStudent(e.target.value)}>{data?.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field> : null}
      <Field label={ui('day')} htmlFor="published-day"><select id="published-day" className={inputClassName} value={selectedDay} onChange={e => setSelectedDay(Number(e.target.value))}><option value={0}>{ui('allDays')}</option>{days.map((key, index) => <option key={key} value={index + 1}>{week(key)}</option>)}</select></Field>
      <div className="flex items-end"><Button type="button" variant="outline" disabled={!data?.today} onClick={() => { if (data?.today) { setDate(data.today); setSelectedDay(calendarDay(data.today)); } }}>{ui('today')}</Button></div>
    </div>
    <nav className="tt-day-nav" aria-label={ui('weekHint')}>{days.map((key,index)=><Button type="button" key={key} variant="outline" aria-pressed={selectedDay===index+1} onClick={()=>setSelectedDay(index+1)}>{week(key)}</Button>)}</nav>
    {data ? <div className="space-y-2"><p className="text-sm font-medium"><bdi dir="ltr">{data.date}</bdi>{Number.isInteger(calendarDay(data.date)) ? ` · ${week(days[calendarDay(data.date) - 1])}` : ''}</p><p className="text-sm text-muted-foreground">{ui('weekHint')}</p>{role === 'PARENT' && data.children.some(child => child.id === data.selectedStudentId) ? <p className="font-semibold"><bdi>{ui('selectedChild', { name: data.children.find(child => child.id === data.selectedStudentId)!.name })}</bdi></p> : null}</div> : null}
    {data?.holidays?.length ? <HolidayState holidays={data.holidays} /> : null}
    <div className={role==='SCHOOL_ADMIN'?'tt-publication-layout':''}><div>{query.isPending ? <p role="status">{t('loading')}</p> : query.isError ? <p role="alert">{t('error')}</p> : data?.schedules.length ? role === 'TEACHER' || role === 'SCHOOL_ADMIN' && mode === 'TEACHER' ? <TeacherWeek schedules={data.schedules} showTeacher={role === 'SCHOOL_ADMIN'} selectedDay={selectedDay} focusDay={calendarDay(data.date)} /> : data.schedules.map(p => <WeeklyPublication key={p.id} schedule={p} selectedDay={selectedDay} weekly={role==='SCHOOL_ADMIN'} />) : data?.holidays?.length ? null : <p role="status" className="rounded-lg border border-dashed bg-card p-5">{t('empty')}</p>}
    <Button variant="outline" onClick={() => void query.refetch()}>{t('retry')}</Button></div>
    {role === 'SCHOOL_ADMIN' && data?.history.length ? <section aria-label={t('history')} className="space-y-3"><h2 className="text-xl font-semibold">{t('history')}</h2><p>{t('historyHelp')}</p>{data.history.map(p => <details key={p.id} className="rounded-md border p-3"><summary className="cursor-pointer">{t('revision')} {p.sequence} · {p.effectiveFrom} · {t(p.effectiveFrom > data.today ? 'scheduled' : p.effectiveUntil < data.today ? 'past' : 'published')}</summary><WeeklyPublication schedule={p} /></details>)}</section> : null}
    </div><p className="text-sm text-muted-foreground">{t('unchanged')}</p>
  </section>;
  return embedded ? <div className="tt-published">{content}</div> : <div className="timetable-workspace tt-published">{content}</div>;
}
export function PublishDraft({ data, disabled }: { data: Awaited<ReturnType<typeof getDraft>>; disabled: boolean }) {
  const design=useTranslations('timetableExperience');
  const t = useTranslations('timetablePublication'), builder = useTranslations('timetableBuilder'), week = useTranslations('timetable'), ui = useTranslations('timetableUi'), cache = useQueryClient();
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
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-label={t('publish')}>
    <p className="text-sm text-muted-foreground">{ui('publishHint')}</p>
    <Button className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={disabled || mutation.isPending || !data.draft || (!data.lessons.length && !state?.latestSequence) || !state || effectiveFrom > data.period.endDate || data.contextChanged} onClick={() => { setOpen(true); setMessage(null); }}>{t('publish')}</Button>
    {!data.draft || (!data.lessons.length && !state?.latestSequence) ? <p>{t('draftRequired')}</p> : null}
    {query.isError ? <p role="alert">{t('error')} <Button variant="outline" onClick={() => void query.refetch()}>{t('retry')}</Button></p> : null}
    {message ? <div role={message === 'saved' ? 'status' : 'alert'}><p>{t(message)}</p>{message !== 'saved' ? <Button variant="outline" onClick={() => { void cache.invalidateQueries({ queryKey: ['timetable-published'] }); void cache.invalidateQueries({ queryKey: ['timetable-draft'] }); }}>{t('retry')}</Button> : null}</div> : null}
    {details.length ? <ul role="alert" className="space-y-2 break-words rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{details.map((c, i) => <li key={i}>{builder('conflict', { kind: builder(c.kind === 'ROOM' ? 'ROOM_CONFLICT' : c.kind), className: c.otherClass, period: c.otherPeriod, day: week(days[c.weekday - 1]), start: c.start, end: c.end })}</li>)}</ul> : null}
    <Modal open={open} title={t('confirm')} onClose={() => { if (!mutation.isPending) setOpen(false); }}><form className="tt-publication-confirm space-y-4" onSubmit={e => { e.preventDefault(); void publish(); }}><dl className="tt-confirm-summary"><div><dt>{t('class')}</dt><dd><bdi>{data.classRow.name}</bdi></dd></div><div><dt>{builder('revision')}</dt><dd>{data.draft?.revision}</dd></div><div><dt>{t('revision')}</dt><dd>{state?.latestSequence??0}</dd></div></dl><p className="font-semibold">{design(state?.latestSequence?'replacement':'firstPublication')}</p><p>{t('confirmHelp')}</p><p>{t('datesHelp')}</p>
      {!data.lessons.length ? <p role="alert">{t('emptyReplacement')}</p> : null}
      <Field label={t('from')} htmlFor="publication-from"><input required type="date" id="publication-from" min={minimum} max={data.period.endDate} className={inputClassName} disabled={mutation.isPending} value={effectiveFrom} onChange={e => setDate(e.target.value)} /></Field>
      {warnings.length ? <><p role="status">{t('warnings')}</p><ul>{warnings.map(p => <li key={p.subjectId}>{data.subjects.find(s => s.id === p.subjectId)?.name} · {builder('count', { scheduled: String(p.scheduled), required: String(p.required), minutes: String(p.scheduledMinutes), requiredMinutes: String(p.requiredMinutes) })}</li>)}</ul></> : null}
      <Button className="h-auto min-h-10 max-w-full whitespace-normal py-2" disabled={mutation.isPending || disabled}>{t('confirm')}</Button>
    </form></Modal>
  </section>;
}
