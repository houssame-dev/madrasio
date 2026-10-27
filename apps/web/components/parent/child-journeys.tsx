'use client';
import '@/components/attendance/attendance.css';
import '@/components/homework/homework.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePeopleText } from '@/i18n/use-people-text';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, Pagination, inputClassName } from '@/components/academic/ui';
import { PageContainer } from '@/components/ui/page-container';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { childAttendanceQuery, childHomeworkQuery } from '@/lib/frontend/parent-portal/queries';

/** Mounted only after child bootstrap; the server independently authorizes every request. */
export function ChildJourneys({ schoolId, studentId, yearId }: { schoolId: string; studentId: string; yearId: string }) {
  const text = usePeopleText();

  const params = useSearchParams();
  const [section, setSection] = useState<'attendance' | 'homework' | null>(() => { const value = params?.get('section'); return value === 'attendance' || value === 'homework' ? value : null; });
  const attendanceButton = useRef<HTMLButtonElement>(null);
  const homeworkButton = useRef<HTMLButtonElement>(null);
  return <PageContainer variant="READING_CONTENT" className={section === 'attendance' ? 'at-child-journey space-y-4' : 'space-y-4'}>
    <nav aria-label={text("Child attendance and homework")} className="flex flex-wrap gap-3">
      <button ref={attendanceButton} type="button" aria-pressed={section === 'attendance'} className="min-h-10 rounded-md border px-4 focus-visible:ring-2" onClick={() => setSection('attendance')}>{text("Attendance")}</button>
      <button ref={homeworkButton} type="button" aria-pressed={section === 'homework'} className="min-h-10 rounded-md border px-4 focus-visible:ring-2" onClick={() => setSection('homework')}>{text("Homework")}</button>
    </nav>
    {!yearId ? <p>{text("Select an Academic Year to read Attendance or Homework.")}</p> : section ? <>
      <button type="button" className="min-h-10 underline" onClick={() => { if (['attendance', 'homework'].includes(params?.get('section') ?? '')) { window.location.assign(`/children/${studentId}?academicYearId=${yearId}`); return; } (section === 'attendance' ? attendanceButton : homeworkButton).current?.focus(); setSection(null); }}>{text("Back to child overview")}</button>
      {section === 'attendance' ? <Attendance key={`${schoolId}:${studentId}:${yearId}`} schoolId={schoolId} studentId={studentId} yearId={yearId} /> : <Homework key={`${schoolId}:${studentId}:${yearId}`} schoolId={schoolId} studentId={studentId} yearId={yearId} />}
    </> : <p>{text("Choose Attendance or Homework for the selected Academic Year. These views are read-only.")}</p>}
  </PageContainer>;
}
type Context = { schoolId: string; studentId: string; yearId: string };
function Attendance({ schoolId, studentId, yearId }: Context) {
  const attendanceText = useTranslations('attendance');
  const ui = useTranslations('attendanceUi');
  const text = usePeopleText();

  const [page, setPage] = useState(1);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [error, setError] = useState('');
  const result = useQuery(childAttendanceQuery(schoolId, studentId, yearId, page, range.from, range.to));
  return <section aria-labelledby="child-attendance-title" className="attendance-workspace at-child-history space-y-4">
    <h2 id="child-attendance-title" className="text-lg font-semibold">{text("Attendance history")}</h2>
    <p className="at-notice">{text("Dates are School calendar dates. Missing records do not mean present or absent.")}</p>
    <form className="at-child-filters at-card" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const from = String(fields.get('from') || ''); const to = String(fields.get('to') || '');
      if (from && to && from > to) { setError(text("End date must not precede start date.")); event.currentTarget.querySelector<HTMLInputElement>('#attendance-to')?.focus(); return; }
      setError(''); setPage(1); setRange({ from: from || undefined, to: to || undefined });
    }}>
      <Field label={text("From date")} htmlFor="attendance-from"><input className={inputClassName} id="attendance-from" name="from" type="date" dir="ltr" /></Field>
      <Field label={text("To date")} htmlFor="attendance-to" error={error}><input className={inputClassName} id="attendance-to" name="to" type="date" dir="ltr" /></Field>
      <button type="submit" className="min-h-10 rounded-md border px-4">{text("Apply dates")}</button>
    </form>
    {result.isPending ? <InlineLoading label={text("Loading attendance…")} /> : result.isError ? <ApiErrorState title={text("Attendance unavailable")} description={text("Please retry. If access has changed, return to My children.")} onRetry={() => void result.refetch()} /> : <>
      {result.data.data.length ? <ul className="at-history-list at-card">{result.data.data.map((row) => <li key={row.id} className="at-history-record"><div><time dir="ltr" dateTime={row.date}>{row.date}</time><p className="text-sm text-muted-foreground"><bdi>{row.className}</bdi> · {row.session ? <>{ui('publishedLesson')} · <bdi>{row.session.subjectName}</bdi> · <bdi dir="ltr">{row.session.start}–{row.session.end}</bdi></> : attendanceText('daily')}</p></div><span className="at-status" data-status={row.status}>{text(row.status)}</span></li>)}</ul> : <EmptyState title={text("No attendance records")} />}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
function Homework({ schoolId, studentId, yearId }: Context) {
  const hw = useTranslations('homework');
  const text = usePeopleText();

  const [page, setPage] = useState(1);
  const result = useQuery(childHomeworkQuery(schoolId, studentId, yearId, page));
  return <section aria-labelledby="child-homework-title" className="hw-workspace hw-parent-list space-y-4 rounded-lg border bg-card p-5">
    <h2 id="child-homework-title" className="text-lg font-semibold">{text("Homework for this child")}</h2>
    <p>{text("Eligibility follows enrollment on each due date, including historical Classes. Due dates are School calendar dates.")}</p>
    {result.isPending ? <InlineLoading label={text("Loading homework…")} /> : result.isError ? <ApiErrorState title={text("Homework unavailable")} description={text("Please retry. If access has changed, return to My children.")} onRetry={() => void result.refetch()} /> : <>
      {result.data.data.length ? <ul className="space-y-3">{result.data.data.map((row) => <li key={row.id}>
        <h3 dir="auto">{row.title}</h3><p className="mt-2 text-sm text-muted-foreground" dir="auto">{row.subjectName} · {row.periodName} · {text(row.status)}</p><p className="mt-2 text-sm">{text("Due:")}{' '}<time dir="ltr" dateTime={row.dueDate}>{row.dueDate}</time></p><details className="mt-3"><summary className="min-h-10 cursor-pointer font-medium focus-visible:ring-2">{hw('descriptionField')}</summary><p className="hw-instructions">{row.description || text("No additional instructions.")}</p></details><Link className="mt-3 inline-flex items-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2" href={`/homework/${row.id}?studentId=${studentId}&academicYearId=${yearId}`}>{hw('details')}</Link>
      </li>)}</ul> : <EmptyState title={text("No homework for this child")} />}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
