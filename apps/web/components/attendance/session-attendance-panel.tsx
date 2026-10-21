'use client';
import { useCallback, useEffect, useState } from 'react';
import { schoolWallTimeToInstant } from '@school/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import { inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { AttendanceRoster } from './attendance-roster';

export function SessionAttendancePanel({ schoolId, timezone, onDirtyChange }: { schoolId: string; timezone: string; onDirtyChange: (dirty: boolean) => void }) {
  const t = useTranslations('attendance');
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
    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span>{t('date')}</span><input type="date" dir="ltr" className={inputClassName} value={date} max={schoolCalendarToday(timezone)} onChange={e => { if (!discard()) return; setDate(e.target.value); setSelected(''); setPage(1); setDirty(false); onDirtyChange(false); }} /></label>
      <label className="space-y-1"><span>{t('sessions')}</span><select className={selectClassName} value={selected} onChange={e => { if (!discard()) return; setSelected(e.target.value); setPage(1); setDirty(false); onDirtyChange(false); }}><option value="">{t('selectSession')}</option>{sessions.data?.data.sessions.map(s => <option key={`${s.publicationId}:${s.lessonKey}`} value={`${s.publicationId}:${s.lessonKey}`}>{s.date} · {s.className} · {s.subjectName} · {s.start}–{s.end}</option>)}</select></label></div>
    {sessions.isPending ? <InlineLoading label={t('loading')} /> : sessions.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void sessions.refetch()} /> : !sessions.data.data.sessions.length ? <EmptyState title={t('noSessions')} /> : null}
    {session ? <><h2 className="text-lg font-semibold"><bdi>{session.className} · {session.subjectName}</bdi> · <span dir="ltr">{session.date} {session.start}–{session.end}</span></h2>{!session.writable ? <p className="text-sm text-muted-foreground">{t('readOnlySession')}</p> : null}
      {roster.isPending ? <InlineLoading label={t('loading')} /> : roster.isError ? <ApiErrorState title={t('rosterUnavailable')} onRetry={() => void roster.refetch()} /> : <AttendanceRoster key={`${date}:${selected}:${page}`} schoolId={schoolId} classId={session.classId} date={date} roster={roster.data} onRefetch={() => roster.refetch()} onDirtyChange={dirtyChanged} onPage={setPage} />}</> : null}
  </section>;
}
