'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@school/ui';
import { AttendanceContextControls } from '@/components/attendance/attendance-context-controls';
import { AttendanceHistory } from '@/components/attendance/attendance-history';
import { DailyAttendancePanel } from '@/components/attendance/daily-attendance-panel';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { ClassDto } from '@/lib/frontend/academic/types';
import { teacherAttendanceClassIds } from '@/lib/frontend/attendance/api';
import { attendanceCopy as t } from '@/lib/frontend/attendance/copy';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { localCalendarToday } from '@/lib/frontend/attendance/schemas';
import { can } from '@/lib/frontend/permissions';

export function AttendanceWorkspace() {
  const app = useAppContext(); const schoolId = app.currentSchool?.id; const role = app.currentSchool?.role;
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter();
  const section = searchParams.get('section') === 'history' ? 'history' : 'daily';
  const academicYearId = searchParams.get('academicYearId') ?? ''; const classId = searchParams.get('classId') ?? ''; const date = searchParams.get('date') ?? localCalendarToday();
  const [dirty, setDirty] = useState(false);
  const allowed = !!schoolId && !!role && role !== 'PARENT' && can(role, 'attendance.read');
  const updateUrl = useCallback((updates: Record<string, string | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (!value) next.delete(key); else next.set(key, value); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const change = useCallback((updates: Record<string, string | undefined>) => { if (dirty && !window.confirm(t.unsavedPrompt)) return; setDirty(false); updateUrl(updates); }, [dirty, updateUrl]);
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'years'), queryFn: academicApi.allYears, enabled: allowed });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId ?? 'no-school', 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes'), enabled: allowed });
  const teacherClasses = useQuery({ queryKey: attendanceKeys.teacherClasses(schoolId ?? 'no-school'), queryFn: teacherAttendanceClassIds, enabled: allowed && role === 'TEACHER' });
  useEffect(() => { const active = years.data?.filter((year) => year.status === 'ACTIVE') ?? []; if (!academicYearId && active.length === 1) updateUrl({ academicYearId: active[0].id, classId: undefined }); }, [academicYearId, updateUrl, years.data]);
  const availableClasses = useMemo(() => (classes.data ?? []).filter((klass) => (!academicYearId || klass.academicYearId === academicYearId) && (role !== 'TEACHER' || (teacherClasses.data ?? []).includes(klass.id))), [academicYearId, classes.data, role, teacherClasses.data]);
  if (!allowed || !schoolId || !role) return <AccessDeniedWithReturn />;
  if (years.isPending || classes.isPending || (role === 'TEACHER' && teacherClasses.isPending)) return <InlineLoading label={t.loading} />;
  if (years.isError || classes.isError || teacherClasses.isError) return <ApiErrorState title={t.rosterUnavailable} onRetry={() => { void years.refetch(); void classes.refetch(); if (role === 'TEACHER') void teacherClasses.refetch(); }} />;
  const selectedYear = years.data.find((year) => year.id === academicYearId);
  const historyClasses = role === 'TEACHER' ? classes.data.filter((klass) => (teacherClasses.data ?? []).includes(klass.id)) : classes.data;
  return <div className="mx-auto max-w-[110rem] space-y-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></header>
    <nav aria-label={t.title} className="flex gap-2"><Button type="button" variant={section === 'daily' ? 'default' : 'outline'} onClick={() => change({ section: 'daily' })}>{t.daily}</Button><Button type="button" variant={section === 'history' ? 'default' : 'outline'} onClick={() => change({ section: 'history' })}>{t.history}</Button></nav>
    {section === 'daily' ? <><AttendanceContextControls years={years.data} classes={availableClasses} academicYearId={academicYearId} classId={classId} date={date} teacherScoped={role === 'TEACHER'} onYear={(value) => change({ academicYearId: value || undefined, classId: undefined })} onClass={(value) => change({ classId: value || undefined })} onDate={(value) => change({ date: value || undefined })} /><p className="text-xs text-muted-foreground">{t.utcLimitation}</p><DailyAttendancePanel key={`${academicYearId}:${classId}:${date}`} schoolId={schoolId} academicYear={selectedYear} classId={classId} date={date} onDirtyChange={setDirty} /></> : <AttendanceHistory schoolId={schoolId} years={years.data} classes={historyClasses} />}
  </div>;
}

