'use client';
import { useCallback, useEffect, useState } from 'react';
import { schoolWallTimeToInstant } from '@school/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import { inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { useAppContext } from '@/components/app/app-context';
import { AttendanceRoster } from './attendance-roster';

export function SessionAttendancePanel({ schoolId, timezone, onDirtyChange }: { schoolId: string; timezone: string; onDirtyChange: (dirty: boolean) => void }) {
  const t = useTranslations('attendance');
  const ui = useTranslations('attendanceUi');
  const app = useAppContext();
  const [date, setDate] = useState(() => schoolCalendarToday(timezone));
  const [selected, setSelected] = useState(''); const [page, setPage] = useState(1); const [dirty, setDirty] = useState(false);
  const sessions = useQuery({ queryKey: ['attendance', schoolId, 'sessions', date], queryFn: () => attendanceApi.sessions(date), enabled: !!date });
  const session = sessions.data?.data.sessions.find(s => `${s.publicationId}:${s.lessonKey}` === selected);
  const roster = useQuery({ queryKey: ['attendance', schoolId, 'session', date, selected, page], queryFn: () => attendanceApi.sessionRoster(session!, page), enabled: !!session });
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
  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">{t('sessionDescription')}</p>
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"><label className="min-w-0 space-y-1 text-sm font-medium"><span>{t('date')}</span><input type="date" dir="ltr" className={inputClassName} value={date} max={schoolCalendarToday(timezone)} onChange={e => { if (!discard()) return; setDate(e.target.value); setSelected(''); setPage(1); setDirty(false); onDirtyChange(false); }} /></label>
      <label className="min-w-0 space-y-1 text-sm font-medium"><span>{t('sessions')}</span><select className={`${selectClassName} min-w-0 max-w-full`} disabled={sessions.isPending || sessions.isError} value={selected} onChange={e => { if (!discard()) return; setSelected(e.target.value); setPage(1); setDirty(false); onDirtyChange(false); }}><option value="">{t('selectSession')}</option>{sessions.data?.data.sessions.map(s => <option key={`${s.publicationId}:${s.lessonKey}`} value={`${s.publicationId}:${s.lessonKey}`}>{s.date} · {s.className} · {s.subjectName} · {s.start}–{s.end}</option>)}</select></label></div>
    {sessions.isPending ? <InlineLoading label={t('loading')} /> : sessions.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void sessions.refetch()} /> : !sessions.data.data.sessions.length ? <EmptyState title={t('noSessions')} /> : null}
    {!selected && sessions.isSuccess && sessions.data.data.sessions.length > 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{ui('chooseSession')}</p> : null}
    {session ? <><div className="space-y-3 rounded-lg border bg-card p-4"><h2 className="text-lg font-semibold"><bdi>{session.className} · {session.subjectName}</bdi></h2><p dir="ltr" className="text-sm tabular-nums">{session.date} {session.start}–{session.end}</p><p className="text-sm font-medium">{ui(app.currentSchool?.role === 'TEACHER' && roster.data?.data.session?.writable ? 'editable' : 'readOnly')}</p>{!session.writable ? <p className="text-sm text-muted-foreground">{t('readOnlySession')}</p> : null}<p className="text-xs text-muted-foreground">{timezone}</p></div>
      {roster.isPending ? <InlineLoading label={t('loading')} /> : roster.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void roster.refetch()} /> : roster.data.data.students.length === 0 ? <EmptyState title={t('emptyRoster')} /> : <AttendanceRoster key={`${date}:${selected}:${page}`} schoolId={schoolId} classId={session.classId} date={date} roster={roster.data} onRefetch={() => roster.refetch()} onDirtyChange={dirtyChanged} onPage={setPage} />}</> : null}
  </section>;
}
