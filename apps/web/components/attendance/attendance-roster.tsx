'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useTranslations } from 'next-intl';
import { ApiClientError } from '@/lib/frontend/api-client';
import { useEffect, useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@school/ui';
import { InlineFeedback, Pagination, inputClassName } from '@/components/academic/ui';
import { useAttendanceCopy } from '@/i18n/use-domain-copy';
import { attendanceApi } from '@/lib/frontend/attendance/api';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { useAppContext } from '@/components/app/app-context';
import { attendanceBatchSchema } from '@/lib/frontend/attendance/schemas';
import type { AttendanceEntryInput, AttendanceStatus, DailyRosterResponse } from '@/lib/frontend/attendance/types';
import { AttendanceStatusControl } from './attendance-status-control';

type Draft = { status: AttendanceStatus | ''; note: string };

export function AttendanceRoster({ schoolId, classId: _classId, date: _date, roster, onRefetch, onDirtyChange, onPage }: {
  schoolId: string;
  classId: string;
  date: string;
  roster: DailyRosterResponse;
  onRefetch: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
  onPage: (page: number) => void;
}) {
  const text = useDomainText();
  const t = useAttendanceCopy();
  const sessionText = useTranslations('attendance');
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const rows = roster.data.students;
  const app = useAppContext();
  const canEdit = app.currentSchool?.role === 'TEACHER' && !!roster.data.session?.writable;
  useEffect(() => {
    if (dirty.size > 0) return;
    setDrafts(Object.fromEntries(rows.map(({ student, attendance }) => [student.id, { status: attendance?.status ?? '', note: attendance?.note ?? '' } satisfies Draft])));
  }, [dirty.size, rows]);
  useEffect(() => { onDirtyChange(dirty.size > 0); }, [dirty.size, onDirtyChange]);
  useEffect(() => {
    if (dirty.size === 0) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const linkGuard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download') || target.href === window.location.href) return;
      if (!window.confirm(t.unsavedPrompt)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', guard);
    document.addEventListener('click', linkGuard, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', linkGuard, true); };
  }, [dirty.size, t.unsavedPrompt]);
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
    mutationFn: async (input: AttendanceEntryInput[]) => {
      if (!canEdit || !roster.data.session) throw new Error('Session is read-only.');
      const result = await attendanceApi.saveSession(roster.data.session, input.map(entry => ({ ...entry, expectedVersion: rows.find(r => r.student.id === entry.studentId)?.attendance?.version ?? null })));
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.all(schoolId) });
      return result;
    },
    onSuccess: async () => { setDirty(new Set()); await onRefetch(); setNotice(t.saved); },
  });
  const save = () => {
    const parsed = attendanceBatchSchema.safeParse({ records });
    if (!parsed.success || records.length !== dirty.size) { setValidationError(parsed.error?.issues[0]?.message ?? text("Choose a status for every changed Student.")); return; }
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">{t.historicalRoster}</p><p className="text-xs text-muted-foreground">{t.rosterLimit}</p></div>{canEdit && !inactiveClass ? <Button type="button" variant="outline" onClick={markAll}><CheckCheck className="size-4" aria-hidden="true" />{t.markAllPresent}</Button> : null}</div>
    {!canEdit ? null : !inactiveClass ? <p className="text-xs text-muted-foreground">{t.markAllPresentHint}</p> : <InlineFeedback kind="error">{t.closedClass}</InlineFeedback>}
    {dirty.size > 0 ? <InlineFeedback kind="error">{t.unsaved}: {dirty.size}</InlineFeedback> : null}
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    {validationError ? <InlineFeedback kind="error">{text(validationError)}</InlineFeedback> : null}
    {mutation.isError ? <InlineFeedback kind="error">{mutation.error instanceof ApiClientError && mutation.error.status === 409 ? sessionText('staleSession') : sessionText('sessionSaveFailed')}</InlineFeedback> : null}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[52rem] text-sm"><thead className="border-b bg-muted/60"><tr><th className="sticky start-0 z-10 bg-muted px-4 py-3 text-start">{t.student}</th><th className="px-4 py-3 text-start">{t.status}</th><th className="px-4 py-3 text-start">{t.note}</th></tr></thead><tbody className="divide-y">{rows.map(({ student, attendance }) => {
      const name = `${student.firstName} ${student.lastName}`; const draft = drafts[student.id] ?? { status: attendance?.status ?? '', note: attendance?.note ?? '' }; const creationLocked = inactiveClass && attendance === null;
      return <tr key={student.id}><th dir="auto" scope="row" className="sticky start-0 bg-background px-4 py-3 text-start font-medium">{name}<span className="block text-xs font-normal text-muted-foreground">{student.studentCode ?? '—'} · {attendance ? t.statuses[attendance.status] : t.notMarked}</span></th><td dir="auto" className="min-w-48 px-4 py-3">{canEdit ? <AttendanceStatusControl name={name} value={draft.status} disabled={creationLocked} onChange={(status) => update(student.id, { status })} /> : <span>{attendance ? t.statuses[attendance.status] : t.notMarked}</span>}</td><td dir="auto" className="min-w-80 px-4 py-3"><label className="sr-only" htmlFor={`attendance-note-${student.id}`}>{t.noteFor(name)}</label>{canEdit ? <input id={`attendance-note-${student.id}`} aria-label={t.noteFor(name)} className={inputClassName} maxLength={1000} disabled={creationLocked || !draft.status} value={draft.note} onChange={(event) => update(student.id, { note: event.target.value })} /> : <p className="whitespace-pre-wrap">{attendance?.note ?? '—'}</p>}</td></tr>;
    })}</tbody></table></div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Pagination {...roster.meta} onPage={(page) => { if (dirty.size > 0 && !window.confirm(t.unsavedPrompt)) return; onDirtyChange(false); onPage(page); }} />{canEdit ? <Button type="button" disabled={dirty.size === 0 || mutation.isPending} onClick={save}>{t.save}</Button> : null}</div>
  </div>;
}
