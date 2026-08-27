'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@school/ui';
import { EmptyTableRow, Pagination, StatusBadge, TableShell, inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { attendanceCopy as t } from '@/lib/frontend/attendance/copy';
import { attendanceErrorMessage } from '@/lib/frontend/attendance/errors';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { attendanceStatuses } from '@/lib/frontend/attendance/schemas';
import type { AttendanceStatus } from '@/lib/frontend/attendance/types';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentKeys } from '@/lib/frontend/students/queries';
import type { StudentDto } from '@/lib/frontend/students/types';

export function AttendanceHistory({ schoolId, years, classes }: { schoolId: string; years: AcademicYearDto[]; classes: ClassDto[] }) {
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
    {students.isError ? <ApiErrorState title={t.historyUnavailable} onRetry={() => void students.refetch()} /> : <div className="space-y-2"><label htmlFor="attendance-student" className="text-sm font-medium">{t.student}</label><select id="attendance-student" className={selectClassName} value={studentId} onChange={(event) => { const nextId = event.target.value; setStudentId(nextId); setSelectedStudent(students.data?.data.find((student) => student.id === nextId)); setPage(1); }}><option value="">{t.selectStudent}</option>{selectedStudent && !students.data?.data.some((student) => student.id === selectedStudent.id) ? <option value={selectedStudent.id}>{selectedStudent.lastName}, {selectedStudent.firstName}{selectedStudent.studentCode ? ` (${selectedStudent.studentCode})` : ''}</option> : null}{students.data?.data.map((student) => <option key={student.id} value={student.id}>{student.lastName}, {student.firstName}{student.studentCode ? ` (${student.studentCode})` : ''}</option>)}</select>{students.data ? <Pagination {...students.data.meta} onPage={setStudentPage} /> : null}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><select aria-label={t.academicYear} className={selectClassName} value={academicYearId} onChange={(event) => { setAcademicYearId(event.target.value); setClassId(''); setPage(1); }}><option value="">All Academic Years</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><select aria-label={t.klass} className={selectClassName} value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1); }}><option value="">All Classes</option>{visibleClasses.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select><select aria-label={t.status} className={selectClassName} value={status} onChange={(event) => { setStatus(event.target.value as AttendanceStatus | ''); setPage(1); }}><option value="">{t.allStatuses}</option>{attendanceStatuses.map((value) => <option key={value} value={value}>{t.statuses[value]}</option>)}</select><label><span className="sr-only">{t.dateFrom}</span><input aria-label={t.dateFrom} type="date" className={inputClassName} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label><span className="sr-only">{t.dateTo}</span><input aria-label={t.dateTo} type="date" className={inputClassName} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></div>
    {invalidRange ? <p role="alert" className="text-sm text-destructive">{t.invalidDateRange}</p> : null}
    {!studentId ? <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">{t.selectStudent}</p> : history.isError ? <ApiErrorState title={t.historyUnavailable} description={attendanceErrorMessage(history.error)} onRetry={() => void history.refetch()} /> : <div className="space-y-4"><TableShell headers={[t.date, t.klass, t.academicYear, t.status, t.note]} loading={history.isPending}>{history.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : history.data?.data.map((record) => <tr key={record.id}><td className="px-4 py-3 tabular-nums">{record.attendanceDate}</td><td className="px-4 py-3">{classes.find((klass) => klass.id === record.classId)?.name ?? record.classId}</td><td className="px-4 py-3">{years.find((year) => year.id === record.academicYearId)?.name ?? record.academicYearId}</td><td className="px-4 py-3"><StatusBadge status={record.status} /></td><td className="max-w-md whitespace-pre-wrap px-4 py-3">{record.note ?? '—'}</td></tr>)}</TableShell>{history.data ? <Pagination {...history.data.meta} onPage={setPage} /> : null}</div>}
  </section>;
}
