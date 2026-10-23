'use client';

import { useQuery } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@school/ui';
import { Pagination, StatusBadge, inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { useAttendanceCopy } from '@/i18n/use-domain-copy';
import { attendanceErrorMessage } from '@/lib/frontend/attendance/errors';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { attendanceStatuses } from '@/lib/frontend/attendance/schemas';
import type { AttendanceStatus } from '@/lib/frontend/attendance/types';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentKeys } from '@/lib/frontend/students/queries';
import type { StudentDto } from '@/lib/frontend/students/types';

export function AttendanceHistory({ schoolId, years, classes }: { schoolId: string; years: AcademicYearDto[]; classes: ClassDto[] }) {
  const text = useDomainText();
  const t = useAttendanceCopy();
  const ui = useTranslations('attendanceUi');
  const [search, setSearch] = useState(''); const [submittedSearch, setSubmittedSearch] = useState(''); const [studentPage, setStudentPage] = useState(1); const [studentId, setStudentId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentDto>();
  const [page, setPage] = useState(1); const [academicYearId, setAcademicYearId] = useState(''); const [classId, setClassId] = useState(''); const [status, setStatus] = useState<AttendanceStatus | ''>(''); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('');
  const studentParams = { page: studentPage, pageSize: 20, search: submittedSearch || undefined };
  const students = useQuery({ queryKey: studentKeys.list(schoolId, studentParams), queryFn: () => studentsApi.list(studentParams) });
  const invalidRange = !!dateFrom && !!dateTo && dateFrom > dateTo;
  const historyParams = { page, pageSize: 20, academicYearId: academicYearId || undefined, classId: classId || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
  const history = useQuery({ queryKey: attendanceKeys.history(schoolId, studentId || 'no-student', historyParams), queryFn: () => attendanceApi.studentHistory(studentId, historyParams), enabled: !!studentId && !invalidRange });
  const visibleClasses = academicYearId ? classes.filter((klass) => klass.academicYearId === academicYearId) : classes;
  return <section className="space-y-5">
    <div><h2 className="text-lg font-semibold">{t.history}</h2><p className="mt-1 text-sm text-muted-foreground">{t.historyDescription}</p></div>
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setSubmittedSearch(search.trim()); setStudentPage(1); }}><label className="sr-only" htmlFor="attendance-student-search">{t.searchStudents}</label><input id="attendance-student-search" className={inputClassName} value={search} placeholder={t.searchStudents} onChange={(event) => setSearch(event.target.value)} /><Button type="submit" variant="outline"><Search className="size-4" aria-hidden="true" />{t.search}</Button>{submittedSearch ? <Button type="button" variant="ghost" onClick={() => { setSearch(''); setSubmittedSearch(''); setStudentPage(1); }}>{t.clear}</Button> : null}</form>
    {students.isPending ? <InlineLoading label={t.loading} /> : null}
    {students.isSuccess && students.data.data.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{ui('noMatches')}</p> : null}
    {students.isError ? <ApiErrorState title={t.historyUnavailable} onRetry={() => void students.refetch()} /> : <div className="space-y-2 [&_nav]:flex-wrap [&_nav>div]:shrink-0"><label htmlFor="attendance-student" className="text-sm font-medium">{t.student}</label><select disabled={students.isPending} id="attendance-student" className={selectClassName} value={studentId} onChange={(event) => { const nextId = event.target.value; setStudentId(nextId); setSelectedStudent(students.data?.data.find((student) => student.id === nextId)); setPage(1); }}><option value="">{t.selectStudent}</option>{selectedStudent && !students.data?.data.some((student) => student.id === selectedStudent.id) ? <option value={selectedStudent.id}>{selectedStudent.lastName}, {selectedStudent.firstName}{selectedStudent.studentCode ? ` (${selectedStudent.studentCode})` : ''}</option> : null}{students.data?.data.map((student) => <option key={student.id} value={student.id}>{student.lastName}, {student.firstName}{student.studentCode ? ` (${student.studentCode})` : ''}</option>)}</select>{students.data ? <Pagination {...students.data.meta} onPage={setStudentPage} /> : null}</div>}
    <fieldset className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">{ui('historyFilters')}</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="min-w-0 space-y-1 text-sm"><span>{t.academicYear}</span><select aria-label={t.academicYear} className={selectClassName} value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setClassId(''); setPage(1); }}><option value="">{text("All Academic Years")}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
        <label className="min-w-0 space-y-1 text-sm"><span>{t.klass}</span><select aria-label={t.klass} className={selectClassName} value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1); }}><option value="">{text("All Classes")}</option>{visibleClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select></label>
        <label className="min-w-0 space-y-1 text-sm"><span>{t.status}</span><select aria-label={t.status} className={selectClassName} value={status} onChange={(event) => { setStatus(event.target.value as AttendanceStatus | ''); setPage(1); }}><option value="">{t.allStatuses}</option>{attendanceStatuses.map((value) => <option key={value} value={value}>{t.statuses[value]}</option>)}</select></label>
        <label className="min-w-0 space-y-1 text-sm"><span>{t.dateFrom}</span><input aria-label={t.dateFrom} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'attendance-range-error' : undefined} type="date" dir="ltr" className={inputClassName} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
        <label className="min-w-0 space-y-1 text-sm"><span>{t.dateTo}</span><input aria-label={t.dateTo} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'attendance-range-error' : undefined} type="date" dir="ltr" className={inputClassName} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
      </div>
    </fieldset>
    {invalidRange ? <p id="attendance-range-error" role="alert" className="text-sm text-destructive">{t.invalidDateRange}</p> : null}
    {!studentId ? <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">{t.selectStudent}</p> : invalidRange ? null : history.isError ? <ApiErrorState title={t.historyUnavailable} description={text(attendanceErrorMessage(history.error))} onRetry={() => void history.refetch()} /> : history.isPending ? <InlineLoading label={t.loading} /> : <div className="space-y-4 [&_nav]:flex-wrap [&_nav>div]:shrink-0">
      {history.data.data.length === 0 ? <EmptyState title={t.noHistory} /> : <ul aria-label={t.history} className="space-y-3">{history.data.data.map(record => <li key={record.id} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold"><time dateTime={record.attendanceDate} dir="ltr">{record.attendanceDate}</time></p><p className="mt-1 text-sm text-muted-foreground">{record.session ? <><bdi>{record.session.subjectName}</bdi> · <bdi dir="ltr">{record.session.start}–{record.session.end}</bdi></> : t.daily}</p></div><StatusBadge status={record.status} label={t.statuses[record.status]} /></div>
        <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div className="min-w-0 break-words"><dt className="text-muted-foreground">{t.klass}</dt><dd><bdi>{classes.find(klass => klass.id === record.classId)?.name ?? record.classId}</bdi></dd></div><div className="min-w-0 break-words"><dt className="text-muted-foreground">{t.academicYear}</dt><dd><bdi>{years.find(year => year.id === record.academicYearId)?.name ?? record.academicYearId}</bdi></dd></div><div className="min-w-0 break-words sm:col-span-2"><dt className="text-muted-foreground">{t.note}</dt><dd className="whitespace-pre-wrap">{record.note ?? '—'}</dd></div></dl>
      </li>)}</ul>}
      <Pagination {...history.data.meta} onPage={setPage} />
    </div>}
  </section>;
}
