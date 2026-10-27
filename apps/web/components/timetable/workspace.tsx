'use client';
import { CalendarDays, DoorOpen, ListChecks, Table2, Send } from 'lucide-react';
import './timetable.css';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import type { TimetableDay } from '@school/database';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { Field, inputClassName } from '@/components/academic/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { can } from '@/lib/frontend/permissions';
import type { state } from '@/lib/modules/timetable/application/service';
import { configurationSchema, loadSchema, roomSchema } from '@/lib/modules/timetable/domain/contracts';

import { TimetableBuilder } from './builder';
import { PublishedTimetables } from './publication';

type State = Awaited<ReturnType<typeof state>>;
type Copy = ReturnType<typeof useTranslations<'timetable'>>;
type Save = (path: 'configurations' | 'rooms' | 'loads', body: unknown) => Promise<boolean>;
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const initialDays: TimetableDay[] = [1, 2, 3, 4, 5].map(day => ({ day, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }));

export function TimetableWorkspace() {
  const context = useAppContext();
  if (context.currentSchool?.role === 'TEACHER' || context.currentSchool?.role === 'PARENT') return <PublishedTimetables key={`${context.user.id}:${context.currentSchool.id}`} />;
  if (!can(context.currentSchool?.role, 'timetable.manage')) return <AccessDeniedWithReturn />;
  return <Screen key={`${context.user.id}:${context.currentSchool!.id}`} schoolId={context.currentSchool!.id} timezone={context.currentSchool!.timezone} />;
}
function Screen({ schoolId, timezone }: { schoolId: string; timezone: string }) {
  const ui = useTranslations('timetableUi'), design = useTranslations('timetableExperience');
  const t = useTranslations('timetable'), builderT=useTranslations('timetableBuilder'); const [draftDirty, setDraftDirty] = useState(false); const cache = useQueryClient(); const [year, setYear] = useState('');
  const [tab, setTab] = useState<'configuration' | 'rooms' | 'loads' | 'builder' | 'published'>('configuration');
  const [message, setMessage] = useState<'saved' | 'error' | 'conflict' | 'invalid' | null>(null);
  const key = ['timetable', schoolId];
  const query = useQuery({ queryKey: [...key, year], queryFn: () => apiRequest<{ data: State }>(`/api/v1/timetable${year ? `?academicYearId=${year}` : ''}`), retry: false });
  const mutation = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => apiRequest(`/api/v1/timetable/${path}`, { method: 'PUT', body: JSON.stringify(body) }), retry: false });
  const save: Save = async (path, body) => {
    const validator = path === 'configurations' ? configurationSchema : path === 'rooms' ? roomSchema : loadSchema;
    if (!validator.safeParse(body).success) { setMessage('invalid'); return false; }
    setMessage(null);
    try { await mutation.mutateAsync({ path, body }); await cache.invalidateQueries({ queryKey: key }); setMessage('saved'); return true; }
    catch (error) { setMessage(error instanceof ApiClientError && error.status === 409 ? 'conflict' : 'error'); return false; }
  };
  if (query.isPending) return <p role="status">{t('loading')}</p>;
  const data = query.data?.data;
  if (query.isError || !data) return <div role="alert">{t('error')} <Button onClick={() => void query.refetch()}>{t('retry')}</Button></div>;
  const selectedYear = data.years.find(y => y.id === data.selectedYearId);
  const busy = mutation.isPending || query.isFetching;
  const readOnly = !selectedYear || !['PLANNED', 'ACTIVE'].includes(selectedYear.status);
  return <div className="timetable-workspace min-w-0 space-y-6 [&_input]:min-w-0 [&_select]:min-w-0 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal" aria-busy={busy}>
    <header className="space-y-2 border-b pb-5"><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-muted-foreground">{t('description')}</p><p className="tt-timezone">{t('timezone')}: <bdi>{timezone}</bdi></p></header>

    <nav aria-label={t('title')} className="tt-areas">{([{value:'configuration',icon:CalendarDays},{value:'rooms',icon:DoorOpen},{value:'loads',icon:ListChecks},{value:'builder',icon:Table2},{value:'published',icon:Send}] as const).map(({value,icon:Icon})=><button type="button" data-tt-tab={value} aria-label={value==='builder'?builderT('title'):value==='published'?t('published'):t(value)} aria-describedby={`tt-hint-${value}`} className="tt-area" key={value} aria-current={tab===value?'page':undefined} disabled={draftDirty} onClick={()=>{setTab(value);setMessage(null);}}><span className="tt-area-icon"><Icon aria-hidden="true" /></span><span><strong>{value==='builder'?builderT('title'):value==='published'?t('published'):t(value)}</strong><small id={`tt-hint-${value}`}>{design(`${value}Hint`)}</small></span></button>)}</nav>
    <p className="tt-area-help text-sm leading-relaxed text-muted-foreground">{ui(`${tab}Hint`)}</p>
    {readOnly && tab !== 'rooms' && tab !== 'published' ? <p role="status" className="text-sm font-medium">{ui('readOnlyYear')}</p> : null}
    {message ? <p role={message === 'saved' ? 'status' : 'alert'} className={`rounded-md border p-3 text-sm ${message === 'saved' ? 'bg-card' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>{t(message)}{message === 'conflict' ? <Button variant="outline" onClick={() => void query.refetch()}>{t('retry')}</Button> : null}</p> : null}
    {tab !== 'rooms' && tab !== 'published' && tab !== 'builder' ? <div className="tt-year-context"><Field label={t('year')} htmlFor="tt-year"><select id="tt-year" className={inputClassName} value={data.selectedYearId ?? ''} disabled={busy || draftDirty} onChange={e => { setYear(e.target.value); setMessage(null); }}>{!data.years.length ? <option value="">{t('selectYear')}</option> : null}{data.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field><p className="text-sm text-muted-foreground">{t('history')}</p></div> : null}
    {tab === 'builder' ? <TimetableBuilder yearControl={<Field label={t('year')} htmlFor="tt-year"><select id="tt-year" className={inputClassName} value={data.selectedYearId ?? ''} disabled={busy || draftDirty} onChange={e => { setYear(e.target.value); setMessage(null); }}>{!data.years.length ? <option value="">{t('selectYear')}</option> : null}{data.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>} key={data.selectedYearId} data={data} schoolId={schoolId} onDirtyChange={setDraftDirty} /> : null}
    {tab === 'published' ? <PublishedTimetables embedded /> : null}
    {tab === 'configuration' ? <Configuration key={data.selectedYearId} data={data} t={t} disabled={busy || readOnly} save={save} /> : null}
    {tab === 'rooms' ? <Rooms key={query.dataUpdatedAt} data={data} t={t} disabled={busy} save={save} /> : null}
    {tab === 'loads' ? <Loads key={`${data.selectedYearId}:${query.dataUpdatedAt}`} data={data} t={t} disabled={busy || readOnly} save={save} /> : null}
  </div>;
}
function Configuration({ data, t, disabled, save }: { data: State; t: Copy; disabled: boolean; save: Save }) {
  const [scope, setScope] = useState('school');
  const current = data.configurations.find(c => c.scopeKey === scope);
  return <section className="space-y-4" aria-label={t('configuration')}>
    <p>{t('precedence')}</p>
    <Field label={t('scope')} htmlFor="tt-scope"><select id="tt-scope" className={inputClassName} value={scope} onChange={e => setScope(e.target.value)} disabled={disabled}>
      <option value="school">{t('school')}</option>{data.stages.filter(s => s.status === 'ACTIVE').map(s => <option key={s.id} value={`stage:${s.id}`}>{t('stage')} · {s.name}</option>)}{data.levels.filter(l => l.status === 'ACTIVE').map(l => <option key={l.id} value={`level:${l.id}`}>{t('level')} · {l.name}</option>)}
    </select></Field>
    <div className="tt-config-layout"><WeekEditor key={`${scope}:${current?.id ?? 'new'}`} current={current} scope={scope} data={data} t={t} disabled={disabled} save={save} />
    <aside className="tt-panel space-y-4"><h2 className="text-lg font-semibold">{t('effective')}</h2>
    {!data.classes.length ? <p>{t('noClasses')}</p> : <ul className="space-y-2">{data.classes.map(c => {
      const config = data.configurations.find(v => v.id === data.effective.find(e => e.classId === c.id)?.configurationId);
      return <li key={c.id} className="rounded-md border p-3"><bdi>{c.name}</bdi> · {config ? <>{t(config.levelId ? 'scopeLevel' : config.stageId ? 'scopeStage' : 'scopeSchool')} · {t('revision')} {config.revision}</> : t('unconfigured')}</li>;
    })}</ul>}
  </aside></div></section>;
}
function WeekEditor({ current, scope, data, t, disabled, save }: { current?: State['configurations'][number]; scope: string; data: State; t: Copy; disabled: boolean; save: Save }) {
  const [days, setDays] = useState<TimetableDay[]>(current?.days ?? initialDays);
  const [selectedDay,setSelectedDay]=useState(current?.days[0]?.day??1);
  const [inherit, setInherit] = useState(scope !== 'school' && (!current || !current.enabled));
  function slot(day: number, index: number, patch: Partial<TimetableDay['slots'][number]>) { setDays(rows => rows.map(d => d.day === day ? { ...d, slots: d.slots.map((s, i) => i === index ? { ...s, ...patch } : s) } : d)); }
  async function submit(e: FormEvent) { e.preventDefault(); await save('configurations', { academicYearId: data.selectedYearId, stageId: scope.startsWith('stage:') ? scope.slice(6) : null, levelId: scope.startsWith('level:') ? scope.slice(6) : null, expectedRevision: current?.revision ?? 0, enabled: !inherit, days }); }
  return <form onSubmit={e => void submit(e)} className="space-y-4 rounded-lg border bg-card p-4">
    {current ? <p>{t('revision')} {current.revision}</p> : <p>{t('empty')}</p>}
    {scope !== 'school' ? <label className="flex items-center gap-2"><input className="size-4 shrink-0 accent-primary" type="checkbox" checked={inherit} disabled={disabled} onChange={e => setInherit(e.target.checked)} />{t('inherit')}</label> : null}
    <p className="text-sm text-muted-foreground">{t('intervals')}</p>
    <nav className="tt-day-nav" aria-label={t('workingDays')}>{weekdays.map((label,index)=><Button type="button" variant="outline" aria-pressed={selectedDay===index+1} data-working={days.some(d=>d.day===index+1)} key={label} onClick={()=>setSelectedDay(index+1)}>{t(label)}</Button>)}</nav><fieldset disabled={disabled || inherit} className="space-y-4"><legend className="font-semibold">{t('workingDays')}</legend>
      {weekdays.map((label, index) => {
        const day = index + 1; const row = days.find(d => d.day === day);
        return <div key={day} hidden={selectedDay!==day} className="space-y-3 rounded-md border p-3">
          <label className="flex items-center gap-2 font-medium"><input className="size-4 shrink-0 accent-primary" type="checkbox" checked={!!row} onChange={e => setDays(previous => e.target.checked ? [...previous, { day, slots: [{ kind: 'LESSON' as const, start: '08:00', end: '09:00' }] }].sort((a, b) => a.day - b.day) : previous.filter(d => d.day !== day))} />{t(label)}</label>
          {row?.slots.map((value, i) => <div key={i} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field label={t('kind')} htmlFor={`tt-kind-${day}-${i}`}><select className={inputClassName} id={`tt-kind-${day}-${i}`} value={value.kind} onChange={e => slot(day, i, { kind: e.target.value as 'LESSON' | 'BREAK' })}><option value="LESSON">{t('LESSON')}</option><option value="BREAK">{t('BREAK')}</option></select></Field>
            <Field label={t('start')} htmlFor={`tt-start-${day}-${i}`}><input dir="ltr" type="time" required className={inputClassName} id={`tt-start-${day}-${i}`} value={value.start} onChange={e => slot(day, i, { start: e.target.value })} /></Field>
            <Field label={t('end')} htmlFor={`tt-end-${day}-${i}`}><input dir="ltr" type="time" required className={inputClassName} id={`tt-end-${day}-${i}`} value={value.end} onChange={e => slot(day, i, { end: e.target.value })} /></Field>
            <Button type="button" variant="outline" aria-label={`${t('remove')} ${t(label)} ${i + 1}`} onClick={() => setDays(previous => previous.map(d => d.day === day ? { ...d, slots: d.slots.filter((_, n) => n !== i) } : d))}>{t('remove')}</Button>
          </div>)}
          {row ? <Button type="button" variant="outline" disabled={row.slots.length >= 24} onClick={() => setDays(previous => previous.map(d => d.day === day ? { ...d, slots: [...d.slots, { kind: 'LESSON', start: d.slots.at(-1)?.end ?? '08:00', end: '12:00' }] } : d))}>{t('addSlot')}</Button> : null}
        </div>;
      })}
    </fieldset><Button disabled={disabled}>{t('save')}</Button>
  </form>;
}
function Rooms({ data, t, disabled, save }: { data: State; t: Copy; disabled: boolean; save: Save }) {
  const [edit, setEdit] = useState<State['rooms'][number] | null>(null);
  const design=useTranslations('timetableExperience');
  const [search,setSearch]=useState(''),[active,setActive]=useState('');
  const shown=data.rooms.filter(r=>r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())&&(!active||String(r.active)===active));
  return <section className="space-y-4" aria-label={t('rooms')}><h2>{t('rooms')}</h2><p>{t('roomNotice')}</p>
    <div className="tt-room-layout"><form key={edit?.id ?? 'new'} className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2" onSubmit={e => {
      e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
      void save('rooms', { ...(edit ? { id: edit.id } : {}), expectedRevision: edit?.revision ?? 0, name: String(f.get('name')), kind: String(f.get('kind')), active: f.get('active') === 'on' }).then(ok => { if (ok) { setEdit(null); form.reset(); } });
    }}><Field label={t('name')} htmlFor="tt-room-name"><input id="tt-room-name" name="name" className={inputClassName} required maxLength={100} defaultValue={edit?.name} disabled={disabled} /></Field>
      <Field label={t('kind')} htmlFor="tt-room-kind"><select id="tt-room-kind" name="kind" className={inputClassName} defaultValue={edit?.kind ?? 'ROOM'} disabled={disabled}><option value="ROOM">{t('ROOM')}</option><option value="LAB">{t('LAB')}</option></select></Field>
      <label className="flex items-center gap-2"><input className="size-4 shrink-0 accent-primary" type="checkbox" name="active" defaultChecked={edit?.active ?? true} disabled={disabled} />{t('active')}</label>
      <div className="flex flex-wrap gap-2"><Button disabled={disabled}>{t(edit ? 'save' : 'addRoom')}</Button>{edit ? <Button type="button" variant="outline" onClick={() => setEdit(null)}>{t('cancel')}</Button> : null}</div>
    </form>
    <div className="tt-panel space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label={design('searchRooms')} htmlFor="tt-room-search"><input type="search" id="tt-room-search" className={inputClassName} value={search} onChange={e=>setSearch(e.target.value)} /></Field><Field label={design('allStatuses')} htmlFor="tt-room-filter"><select id="tt-room-filter" className={inputClassName} value={active} onChange={e=>setActive(e.target.value)}><option value="">{design('allStatuses')}</option><option value="true">{t('active')}</option><option value="false">{t('inactive')}</option></select></Field></div>{!shown.length ? <p>{t('empty')}</p> : <ul className="tt-room-list">{shown.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"><span><bdi>{r.name}</bdi> · {t(r.kind)} · {t(r.active ? 'active' : 'inactive')}</span><Button variant="outline" disabled={disabled} onClick={() => setEdit(r)}>{t('edit')}</Button></li>)}</ul>}
  </div></div></section>;
}
function Loads({ data, t, disabled, save }: { data: State; t: Copy; disabled: boolean; save: Save }) {
  const [classId, setClassId] = useState(data.classes[0]?.id ?? ''); const [subjectId, setSubjectId] = useState('');
  const [edit, setEdit] = useState<State['loads'][number] | null>(null);
  const classRow = data.classes.find(c => c.id === classId);
  const current = data.loads.find(l => l.classId === classId && l.subjectId === subjectId);
  const subjects = data.subjects.filter(s => s.status === 'ACTIVE' && data.curriculumSubjects.some(c => c.curriculumVersionId === classRow?.curriculumVersionId && c.subjectId === s.id && c.status === 'ACTIVE'));
  const selectedYear = data.years.find(y => y.id === data.selectedYearId);
  const assignments = data.assignments.filter(({ assignment: a, teacherStatus }) => a.classId === classId && a.subjectId === subjectId && a.status === 'ACTIVE' && teacherStatus === 'ACTIVE' && selectedYear && a.effectiveFrom <= selectedYear.endDate && (!a.effectiveUntil || a.effectiveUntil >= selectedYear.startDate));
  function begin(value: State['loads'][number]) { setClassId(value.classId); setSubjectId(value.subjectId); setEdit(value); }
  return <section className="tt-loads space-y-4" aria-label={t('loads')}><h2>{t('loads')}</h2><p>{t('loadNotice')}</p>{!data.classes.length ? <p>{t('noClasses')}</p> : <>
    <Field label={t('class')} htmlFor="tt-class"><select className={inputClassName} id="tt-class" value={classId} disabled={disabled} onChange={e => { setClassId(e.target.value); setSubjectId(''); setEdit(null); }}>{data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <div className="tt-load-layout"><form key={`${classId}:${subjectId}:${edit?.id ?? ''}`} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void save('loads', { academicYearId: data.selectedYearId, classId, subjectId, teacherAssignmentId: String(f.get('assignment')), roomId: String(f.get('room')) || null, lessonsPerWeek: Number(f.get('lessons')), durationMinutes: Number(f.get('duration')), expectedRevision: current?.revision ?? 0, enabled: true });
    }}>
      <Field label={t('subject')} htmlFor="tt-subject"><select className={inputClassName} id="tt-subject" value={subjectId} required disabled={disabled} onChange={e => { setSubjectId(e.target.value); setEdit(null); }}><option value="">{t('select')}</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label={t('assignment')} htmlFor="tt-assignment"><select className={inputClassName} id="tt-assignment" name="assignment" required defaultValue={edit?.teacherAssignmentId ?? ''} disabled={disabled}><option value="">{t('select')}</option>{assignments.map(a => <option key={a.assignment.id} value={a.assignment.id}>{a.teacherFirstName} {a.teacherName} · {a.assignment.effectiveFrom} – {a.assignment.effectiveUntil ?? selectedYear?.endDate}</option>)}</select></Field>
      {!assignments.length ? <p className="text-sm sm:col-span-2">{t('noAssignment')}</p> : null}
      <Field label={t('lessons')} htmlFor="tt-lessons"><input className={inputClassName} id="tt-lessons" name="lessons" type="number" min={1} max={60} required defaultValue={edit?.lessonsPerWeek ?? 1} disabled={disabled} /></Field>
      <Field label={t('duration')} htmlFor="tt-duration"><input className={inputClassName} id="tt-duration" name="duration" type="number" min={5} max={240} required defaultValue={edit?.durationMinutes ?? 60} disabled={disabled} /></Field>
      <Field label={t('rooms')} htmlFor="tt-load-room"><select className={inputClassName} id="tt-load-room" name="room" defaultValue={edit?.roomId ?? ''} disabled={disabled}><option value="">{t('noRoom')}</option>{data.rooms.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <div className="flex items-end gap-2"><Button disabled={disabled || classRow?.status !== 'ACTIVE' || !assignments.length}>{t(current ? 'save' : 'addLoad')}</Button>{edit ? <Button type="button" variant="outline" onClick={() => { setEdit(null); setSubjectId(''); }}>{t('cancel')}</Button> : null}</div>
    </form>
    <div>{!data.loads.filter(l => l.classId === classId).length ? <p>{t('empty')}</p> : <ul className="grid gap-3 sm:grid-cols-2">{data.loads.filter(l => l.classId === classId).map(l => {
      const assignment = data.assignments.find(a => a.assignment.id === l.teacherAssignmentId);
      return <li key={l.id} className="space-y-2 rounded-lg border bg-card p-4"><h2 className="font-semibold"><bdi>{data.subjects.find(s => s.id === l.subjectId)?.name}</bdi></h2><p>{t('lessons')}: {l.lessonsPerWeek} · {t('duration')}: {l.durationMinutes}</p><p>{t('weeklyMinutes')}: {l.lessonsPerWeek * l.durationMinutes} · {t('revision')} {l.revision} · {t(l.enabled ? 'active' : 'retired')}</p><p><bdi>{assignment?.teacherFirstName} {assignment?.teacherName}</bdi></p>{assignment?.assignment.status !== 'ACTIVE' || assignment?.teacherStatus !== 'ACTIVE' ? <p>{t('assignmentUnavailable')}</p> : null}<p><bdi>{data.rooms.find(r => r.id === l.roomId)?.name ?? t('noRoom')}</bdi>{l.roomId && !data.rooms.find(r => r.id === l.roomId)?.active ? ` · ${t('roomUnavailable')}` : ''}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => begin(l)}>{t('edit')}</Button>{l.enabled ? <Button variant="outline" disabled={disabled} onClick={() => void save('loads', { academicYearId: l.academicYearId, classId: l.classId, subjectId: l.subjectId, teacherAssignmentId: l.teacherAssignmentId, roomId: l.roomId, lessonsPerWeek: l.lessonsPerWeek, durationMinutes: l.durationMinutes, expectedRevision: l.revision, enabled: false })}>{t('retire')}</Button> : null}</div></li>;
    })}</ul>}
  </div></div></>}</section>;
}
