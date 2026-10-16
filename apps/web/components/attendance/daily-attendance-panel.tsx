'use client';

import { useQuery } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useCallback, useState } from 'react';
import { InlineFeedback } from '@/components/academic/ui';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { useAttendanceCopy } from '@/i18n/use-domain-copy';
import { attendanceErrorMessage } from '@/lib/frontend/attendance/errors';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import type { AcademicYearDto } from '@/lib/frontend/academic/types';
import { AttendanceRoster } from './attendance-roster';

export function DailyAttendancePanel({ schoolId, timezone, academicYear, classId, date, onDirtyChange }: {
  schoolId: string;
  timezone: string;
  academicYear?: AcademicYearDto;
  classId: string;
  date: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const text = useDomainText();
  const t = useAttendanceCopy();
  const [page, setPage] = useState(1);
  const future = !!date && date > schoolCalendarToday(timezone);
  const outsideYear = !!academicYear && !!date && (date < academicYear.startDate || date > academicYear.endDate);
  const valid = !!academicYear && !!classId && !!date && !future && !outsideYear;
  const query = useQuery({ queryKey: attendanceKeys.daily(schoolId, classId || 'no-class', date || 'no-date', page), queryFn: () => attendanceApi.daily(classId, date, page), enabled: valid });
  const stableDirty = useCallback(onDirtyChange, [onDirtyChange]);
  if (!academicYear || !classId || !date) return <EmptyState title={t.selectContext} description={t.dailyDescription} />;
  if (future) return <InlineFeedback kind="error">{t.futureDate}</InlineFeedback>;
  if (outsideYear) return <InlineFeedback kind="error">{t.outsideYear}</InlineFeedback>;
  if (query.isPending) return <InlineLoading label={t.loading} />;
  if (query.isError) return <ApiErrorState title={t.rosterUnavailable} description={text(attendanceErrorMessage(query.error))} onRetry={() => void query.refetch()} />;
  if (query.data.data.students.length === 0) return <EmptyState title={t.emptyRoster} description={t.historicalRoster} />;
  return <AttendanceRoster key={`${classId}:${date}:${page}`} schoolId={schoolId} classId={classId} date={date} roster={query.data} onRefetch={() => query.refetch()} onDirtyChange={stableDirty} onPage={setPage} />;
}
