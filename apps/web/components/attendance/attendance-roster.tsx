'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@school/ui';
import { InlineFeedback, Pagination, inputClassName } from '@/components/academic/ui';
import { attendanceCopy as t } from '@/lib/frontend/attendance/copy';
import { attendanceErrorMessage } from '@/lib/frontend/attendance/errors';
import { saveDailyAttendance } from '@/lib/frontend/attendance/mutations';
import { attendanceBatchSchema } from '@/lib/frontend/attendance/schemas';
import type { AttendanceEntryInput, AttendanceStatus, DailyRosterResponse } from '@/lib/frontend/attendance/types';
import { AttendanceStatusControl } from './attendance-status-control';

type Draft = { status: AttendanceStatus | ''; note: string };

export function AttendanceRoster({ schoolId, classId, date, roster, onRefetch, onDirtyChange, onPage }: {
  schoolId: string;
  classId: string;
  date: string;
  roster: DailyRosterResponse;
  onRefetch: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
  onPage: (page: number) => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const rows = roster.data.students;
  useEffect(() => {
    if (dirty.size > 0) return;
    setDrafts(Object.fromEntries(rows.map(({ student, attendance }) => [student.id, { status: attendance?.status ?? '', note: attendance?.note ?? '' } satisfies Draft])));
  }, [dirty.size, rows]);
  useEffect(() => { onDirtyChange(dirty.size > 0); }, [dirty.size, onDirtyChange]);
  useEffect(() => {
    if (dirty.size === 0) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty.size]);
  const update = (studentId: string, value: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [studentId]: { ...current[studentId], ...value } }));
    setDirty((current) => new Set(current).add(studentId));
    setNotice(undefined); setValidationError(undefined);
  };
  const records = useMemo(() => [...dirty].flatMap((studentId): AttendanceEntryInput[] => {
    const draft = drafts[studentId];
    return draft?.status ? [{ studentId, status: draft.status, note: draft.note.trim() || null }] : [];
  }), [dirty, drafts]);
  const mutation = useMutation({
    mutationFn: (input: AttendanceEntryInput[]) => saveDailyAttendance(queryClient, schoolId, classId, date, input),
    onSuccess: async () => { setDirty(new Set()); await onRefetch(); setNotice(t.saved); },
  });
  const save = () => {
    const parsed = attendanceBatchSchema.safeParse({ records });
    if (!parsed.success || records.length !== dirty.size) { setValidationError(parsed.error?.issues[0]?.message ?? 'Choose a status for every changed Student.'); return; }
    mutation.mutate(parsed.data.records);
  };
  const markAll = () => {
    const unmarked = rows.filter(({ student, attendance }) => attendance === null && !drafts[student.id]?.status);
    if (unmarked.length === 0) return;
    setDrafts((current) => ({ ...current, ...Object.fromEntries(unmarked.map(({ student }) => [student.id, { status: 'PRESENT' as const, note: current[student.id]?.note ?? '' }])) }));
    setDirty((current) => new Set([...current, ...unmarked.map(({ student }) => student.id)]));
    setNotice(undefined); setValidationError(undefined);
  };
  const inactiveClass = roster.data.class.status !== 'ACTIVE';
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">{t.historicalRoster}</p><p className="text-xs text-muted-foreground">{t.rosterLimit}</p></div>{!inactiveClass ? <Button type="button" variant="outline" onClick={markAll}><CheckCheck className="size-4" aria-hidden="true" />{t.markAllPresent}</Button> : null}</div>
    {!inactiveClass ? <p className="text-xs text-muted-foreground">{t.markAllPresentHint}</p> : <InlineFeedback kind="error">{t.closedClass}</InlineFeedback>}
    {dirty.size > 0 ? <InlineFeedback kind="error">{t.unsaved}: {dirty.size}</InlineFeedback> : null}
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    {validationError ? <InlineFeedback kind="error">{validationError}</InlineFeedback> : null}
    {mutation.isError ? <InlineFeedback kind="error">{attendanceErrorMessage(mutation.error)}</InlineFeedback> : null}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[52rem] text-sm"><thead className="border-b bg-muted/60"><tr><th className="sticky start-0 z-10 bg-muted px-4 py-3 text-start">{t.student}</th><th className="px-4 py-3 text-start">{t.status}</th><th className="px-4 py-3 text-start">{t.note}</th></tr></thead><tbody className="divide-y">{rows.map(({ student, attendance }) => {
      const name = `${student.firstName} ${student.lastName}`; const draft = drafts[student.id] ?? { status: attendance?.status ?? '', note: attendance?.note ?? '' }; const creationLocked = inactiveClass && attendance === null;
      return <tr key={student.id}><th scope="row" className="sticky start-0 bg-background px-4 py-3 text-start font-medium">{name}<span className="block text-xs font-normal text-muted-foreground">{student.studentCode ?? '—'} · {attendance ? t.statuses[attendance.status] : t.notMarked}</span></th><td className="min-w-48 px-4 py-3"><AttendanceStatusControl name={name} value={draft.status} disabled={creationLocked} onChange={(status) => update(student.id, { status })} /></td><td className="min-w-80 px-4 py-3"><label className="sr-only" htmlFor={`attendance-note-${student.id}`}>{t.noteFor(name)}</label><input id={`attendance-note-${student.id}`} aria-label={t.noteFor(name)} className={inputClassName} maxLength={1000} disabled={creationLocked || !draft.status} value={draft.note} onChange={(event) => update(student.id, { note: event.target.value })} /></td></tr>;
    })}</tbody></table></div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Pagination {...roster.meta} onPage={(page) => { if (dirty.size > 0 && !window.confirm(t.unsavedPrompt)) return; onDirtyChange(false); onPage(page); }} /><Button type="button" disabled={dirty.size === 0 || mutation.isPending} onClick={save}>{t.save}</Button></div>
  </div>;
}
