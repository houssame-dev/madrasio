'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, Pagination, inputClassName } from '@/components/academic/ui';
import { PageContainer } from '@/components/ui/page-container';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { childAttendanceQuery, childHomeworkQuery } from '@/lib/frontend/parent-portal/queries';

/** Mounted only after child bootstrap; the server independently authorizes every request. */
export function ChildJourneys({ schoolId, studentId, yearId }: { schoolId: string; studentId: string; yearId: string }) {
  const [section, setSection] = useState<'attendance' | 'homework' | null>(null);
  const attendanceButton = useRef<HTMLButtonElement>(null);
  const homeworkButton = useRef<HTMLButtonElement>(null);
  return <PageContainer variant="READING_CONTENT" className="space-y-4">
    <nav aria-label="Child attendance and homework" className="flex flex-wrap gap-3">
      <button ref={attendanceButton} type="button" aria-pressed={section === 'attendance'} className="min-h-10 rounded-md border px-4 focus-visible:ring-2" onClick={() => setSection('attendance')}>Attendance</button>
      <button ref={homeworkButton} type="button" aria-pressed={section === 'homework'} className="min-h-10 rounded-md border px-4 focus-visible:ring-2" onClick={() => setSection('homework')}>Homework</button>
    </nav>
    {!yearId ? <p>Select an Academic Year to read Attendance or Homework.</p> : section ? <>
      <button type="button" className="min-h-10 underline" onClick={() => { (section === 'attendance' ? attendanceButton : homeworkButton).current?.focus(); setSection(null); }}>Back to child overview</button>
      {section === 'attendance' ? <Attendance key={`${schoolId}:${studentId}:${yearId}`} schoolId={schoolId} studentId={studentId} yearId={yearId} /> : <Homework key={`${schoolId}:${studentId}:${yearId}`} schoolId={schoolId} studentId={studentId} yearId={yearId} />}
    </> : <p>Choose Attendance or Homework for the selected Academic Year. These views are read-only.</p>}
  </PageContainer>;
}
type Context = { schoolId: string; studentId: string; yearId: string };
function Attendance({ schoolId, studentId, yearId }: Context) {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [error, setError] = useState('');
  const result = useQuery(childAttendanceQuery(schoolId, studentId, yearId, page, range.from, range.to));
  return <section aria-labelledby="child-attendance-title" className="space-y-4 rounded-lg border p-5">
    <h2 id="child-attendance-title" className="text-lg font-semibold">Attendance history</h2>
    <p>Dates are School calendar dates. Missing records do not mean present or absent.</p>
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const from = String(fields.get('from') || ''); const to = String(fields.get('to') || '');
      if (from && to && from > to) { setError('End date must not precede start date.'); event.currentTarget.querySelector<HTMLInputElement>('#attendance-to')?.focus(); return; }
      setError(''); setPage(1); setRange({ from: from || undefined, to: to || undefined });
    }}>
      <Field label="From date" htmlFor="attendance-from"><input className={inputClassName} id="attendance-from" name="from" type="date" /></Field>
      <Field label="To date" htmlFor="attendance-to" error={error}><input className={inputClassName} id="attendance-to" name="to" type="date" /></Field>
      <button type="submit" className="min-h-10 rounded-md border px-4">Apply dates</button>
    </form>
    {result.isPending ? <InlineLoading label="Loading attendance…" /> : result.isError ? <ApiErrorState title="Attendance unavailable" description="Please retry. If access has changed, return to My children." onRetry={() => void result.refetch()} /> : <>
      {result.data.data.length ? <ul className="divide-y">{result.data.data.map((row) => <li key={row.id} className="py-3"><time dateTime={row.date}>{row.date}</time> · {row.className} · {row.status}</li>)}</ul> : <EmptyState title="No attendance records" />}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
function Homework({ schoolId, studentId, yearId }: Context) {
  const [page, setPage] = useState(1);
  const result = useQuery(childHomeworkQuery(schoolId, studentId, yearId, page));
  return <section aria-labelledby="child-homework-title" className="space-y-4 rounded-lg border p-5">
    <h2 id="child-homework-title" className="text-lg font-semibold">Homework for this child</h2>
    <p>Eligibility follows enrollment on each due date, including historical Classes. Due dates are School calendar dates.</p>
    {result.isPending ? <InlineLoading label="Loading homework…" /> : result.isError ? <ApiErrorState title="Homework unavailable" description="Please retry. If access has changed, return to My children." onRetry={() => void result.refetch()} /> : <>
      {result.data.data.length ? <ul className="space-y-3">{result.data.data.map((row) => <li key={row.id}>
        <details className="rounded-md border p-3"><summary className="min-h-10 cursor-pointer font-medium focus-visible:ring-2">{row.title}</summary>
          <p>{row.subjectName} · {row.periodName} · {row.status}</p>
          <p>Due: <time dateTime={row.dueDate}>{row.dueDate}</time></p>
          <p className="whitespace-pre-wrap break-words">{row.description || 'No additional instructions.'}</p>
        </details>
      </li>)}</ul> : <EmptyState title="No homework for this child" />}
      <Pagination {...result.data.meta} onPage={setPage} />
    </>}
  </section>;
}
