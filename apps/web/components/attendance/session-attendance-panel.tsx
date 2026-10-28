'use client';
import { HolidayState } from '@/components/academic/holiday-state';
import { useCallback, useEffect, useState } from 'react';
import { schoolWallTimeToInstant } from '@school/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { teacherSessionHint } from '@/lib/frontend/dashboard/teacher-workspace-types';
import { Button } from '@school/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import { inputClassName } from '@/components/academic/ui';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { useAppContext } from '@/components/app/app-context';
import { AttendanceRoster } from './attendance-roster';

export function SessionAttendancePanel({ schoolId, timezone, onDirtyChange }: { schoolId: string; timezone: string; onDirtyChange: (dirty: boolean) => void }) {
  const t = useTranslations('attendance');
  const ui = useTranslations('attendanceUi');
  const app = useAppContext();
  const format = useFormatter();
  const params = useSearchParams();
  const hint = app.currentSchool?.role === 'TEACHER' && params ? teacherSessionHint(params, schoolCalendarToday(timezone)) : null;
  const [date, setDate] = useState(() => hint?.date ?? schoolCalendarToday(timezone));
  const [selected, setSelected] = useState(() => hint?.selected ?? ''); const [page, setPage] = useState(1); const [dirty, setDirty] = useState(false);
  const sessions = useQuery({ queryKey: ['attendance', schoolId, 'sessions', date], queryFn: () => attendanceApi.sessions(date), enabled: !!date });
  const session = sessions.data?.data.sessions.find(s => `${s.publicationId}:${s.lessonKey}` === selected);
  const roster = useQuery({ queryKey: ['attendance', schoolId, 'session', date, selected, page], queryFn: () => attendanceApi.sessionRoster(session!, page), enabled: !!session });
  useEffect(() => {
    // A dashboard URL is only a hint. Discard it unless current server scope includes the session.
    if (sessions.isSuccess && selected && !session && !dirty) setSelected('');
  }, [sessions.isSuccess, selected, session, dirty]);
  const { refetch: refreshSessions } = sessions;
  const { refetch: refreshRoster } = roster;
  useEffect(() => {
    if (!session || session.writable || dirty) return;
    let startsAt: number;
    try { startsAt = Date.parse(schoolWallTimeToInstant(`${session.date}T${session.start}:00`, timezone)); } catch { return; }
    const delay = startsAt - Date.now();
    if (delay <= 0) return;
    // Refresh authority from the server once; never grant permission from the browser clock.
    const timer = window.setTimeout(() => {
      void refreshSessions();
      void refreshRoster();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session, timezone, dirty, refreshSessions, refreshRoster]);
  const discard = () => !dirty || window.confirm(t('unsavedPrompt'));
  const dirtyChanged = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
  // Explanatory timing only. The server remains the sole source of write authority.
  const beforeStart = (value: { date: string; start: string }) => { try { return Date.parse(schoolWallTimeToInstant(`${value.date}T${value.start}:00`, timezone)) > Date.now(); } catch { return false; } };
  const selectSession = (value: string) => { if (!discard()) return; setSelected(value); setPage(1); setDirty(false); onDirtyChange(false); };
  const changeDate = (value: string) => { if (!discard()) return; setDate(value); setSelected(''); setPage(1); setDirty(false); onDirtyChange(false); };
  const datedLabel = date ? format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' }) : '';
  return <section className="at-sessions space-y-4">
    <>
      <div className="at-datebar"><label className="space-y-1 text-sm font-medium"><span>{t('date')}</span><input type="date" dir="ltr" className={inputClassName} value={date} max={schoolCalendarToday(timezone)} onChange={e => changeDate(e.target.value)} /></label><Button type="button" variant="outline" onClick={() => changeDate(schoolCalendarToday(timezone))}>{ui('today')}</Button></div>
      <p className="text-sm text-muted-foreground"><time dateTime={date}>{datedLabel}</time> · <bdi>{timezone}</bdi></p>
      {!session ? <p className="at-notice">{t('sessionDescription')}</p> : null}
    </>
    {sessions.isPending ? <InlineLoading label={t('loading')} /> : sessions.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void sessions.refetch()} /> : !sessions.data.data.sessions.length && !sessions.data.data.holidays?.length ? <EmptyState title={t('noSessions')} /> : null}
    {sessions.isSuccess && sessions.data.data.holidays?.length ? <HolidayState attendance holidays={sessions.data.data.holidays} /> : null}
    {!session && sessions.isSuccess && sessions.data.data.sessions.length > 0 ? <div className="at-card">
      <h2>{ui(app.currentSchool?.role === 'TEACHER' ? 'mySessions' : 'publishedSessions')}</h2>
      <p className="text-sm text-muted-foreground">{ui('chooseSession')}</p>
      <ul className="at-session-list">{sessions.data.data.sessions.map(s => <li key={`${s.publicationId}:${s.lessonKey}`}>
        <bdi dir="ltr" className="at-time">{s.start}–{s.end}</bdi><div className="at-session-name"><h3><bdi>{s.subjectName}</bdi></h3><p><bdi>{s.className}</bdi></p></div>
        <div className="at-session-actions"><span className="at-status" data-status={s.writable && app.currentSchool?.role === 'TEACHER' ? 'PRESENT' : 'UNMARKED'}>{ui(s.writable && app.currentSchool?.role === 'TEACHER' ? 'editable' : app.currentSchool?.role === 'TEACHER' && beforeStart(s) ? 'notStarted' : 'readOnly')}</span><Button type="button" variant="outline" onClick={() => selectSession(`${s.publicationId}:${s.lessonKey}`)}>{ui(s.writable && app.currentSchool?.role === 'TEACHER' ? 'openRoster' : 'viewRoster')}<span className="sr-only"> · {s.subjectName} · {s.className} · {s.start}</span></Button></div>
      </li>)}</ul>
    </div> : null}
    {session ? <><div className="at-card at-session-heading"><div><p className="text-sm text-muted-foreground"><time dateTime={date}>{datedLabel}</time> · <bdi dir="ltr">{session.start}–{session.end}</bdi></p><h2><bdi>{session.subjectName} — {session.className}</bdi></h2><span className="at-status" data-status={app.currentSchool?.role === 'TEACHER' && roster.data?.data.session?.writable ? 'PRESENT' : 'UNMARKED'}>{ui(app.currentSchool?.role === 'TEACHER' && roster.data?.data.session?.writable ? 'editable' : 'readOnly')}</span>{!session.writable ? <p className="mt-2 text-sm text-muted-foreground">{t('readOnlySession')}</p> : null}<p className="mt-2 text-xs text-muted-foreground"><bdi>{timezone}</bdi></p></div><Button type="button" variant="outline" onClick={() => selectSession('')}>{ui('backSessions')}</Button></div>
      {roster.isPending ? <InlineLoading label={t('loading')} /> : roster.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void roster.refetch()} /> : roster.data.data.students.length === 0 ? <EmptyState title={t('emptyRoster')} /> : <AttendanceRoster key={`${date}:${selected}:${page}`} schoolId={schoolId} classId={session.classId} date={date} roster={roster.data} onRefetch={() => roster.refetch()} onDirtyChange={dirtyChanged} onPage={setPage} />}</> : null}
  </section>;
}
