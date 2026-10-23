'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useTranslations } from 'next-intl';
import { ApiClientError } from '@/lib/frontend/api-client';
import { useEffect, useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@school/ui';
import { InlineFeedback, Pagination, StatusBadge, inputClassName } from '@/components/academic/ui';
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
  const ui = useTranslations('attendanceUi');
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
    const unmarked = rows.filter(({ student, attendance }) => attendance === null && !dirty.has(student.id) && !drafts[student.id]?.status);
    if (unmarked.length === 0) return;
    setDrafts((current) => ({ ...current, ...Object.fromEntries(unmarked.map(({ student }) => [student.id, { status: 'PRESENT' as const, note: current[student.id]?.note ?? '' }])) }));
    setDirty((current) => new Set([...current, ...unmarked.map(({ student }) => student.id)]));
    setNotice(undefined); setValidationError(undefined);
  };
  const inactiveClass = roster.data.class.status !== 'ACTIVE';
  const StudentHeading = roster.data.session ? 'h3' : 'h2';
  return <div className="space-y-4" aria-busy={mutation.isPending}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1"><p className="text-sm text-muted-foreground">{ui('rosterHint')}</p></div>
      {canEdit && !inactiveClass ? <Button type="button" variant="outline" className="h-auto min-h-10 shrink-0 whitespace-normal" disabled={mutation.isPending} onClick={markAll}><CheckCheck className="size-4 shrink-0" aria-hidden="true" />{t.markAllPresent}</Button> : null}
    </div>
    {canEdit && !inactiveClass ? <p className="text-sm text-muted-foreground">{ui('bulkHint')}</p> : canEdit ? <InlineFeedback kind="error">{t.closedClass}</InlineFeedback> : null}
    {validationError ? <InlineFeedback kind="error">{validationError === 'Note must contain at most 1,000 characters.' ? ui('noteTooLong') : text(validationError)}</InlineFeedback> : null}
    {mutation.isError ? <div className="space-y-2"><InlineFeedback kind="error">{mutation.error instanceof ApiClientError && mutation.error.status === 409 ? sessionText('staleSession') : sessionText('sessionSaveFailed')}</InlineFeedback><p className="text-sm text-muted-foreground">{ui('editsKept')}</p></div> : null}
    <div className="hidden grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)_minmax(0,1.3fr)] gap-4 px-4 text-sm font-medium text-muted-foreground md:grid" aria-hidden="true"><span>{t.student}</span><span>{t.status}</span><span>{t.note}</span></div>
    <ul aria-label={t.student} className="space-y-3">{rows.map(({ student, attendance }) => {
      const name = `${student.firstName} ${student.lastName}`; const draft = drafts[student.id] ?? { status: attendance?.status ?? '', note: attendance?.note ?? '' }; const creationLocked = inactiveClass && attendance === null;
      const changed = dirty.has(student.id);
      return <li key={student.id} className={`grid min-w-0 gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)_minmax(0,1.3fr)] ${changed ? 'border-ring' : ''}`}>
        <div className="min-w-0 space-y-2 break-words">
          <StudentHeading className="font-semibold"><bdi>{name}</bdi></StudentHeading>
          <p className="text-xs text-muted-foreground"><bdi>{student.studentCode ?? '—'}</bdi></p>
          <p className="text-xs text-muted-foreground">{ui('recordedStatus')}: {attendance ? t.statuses[attendance.status] : t.notMarked}</p>
          {changed ? <span className="inline-flex rounded-md border border-primary/30 bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">{ui('changed')}</span> : null}
        </div>
        <div className="min-w-0 space-y-1.5"><p className="text-sm font-medium md:sr-only">{t.status}</p>{canEdit ? <AttendanceStatusControl name={name} value={draft.status} disabled={creationLocked || mutation.isPending} onChange={(status) => update(student.id, { status })} /> : <StatusBadge status={attendance?.status ?? 'UNMARKED'} label={attendance ? t.statuses[attendance.status] : t.notMarked} />}</div>
        <div className="min-w-0 space-y-1.5"><label className="block text-sm font-medium md:sr-only" htmlFor={`attendance-note-${student.id}`}>{t.note}</label>{canEdit ? <input id={`attendance-note-${student.id}`} aria-label={t.noteFor(name)} className={inputClassName} maxLength={1000} disabled={creationLocked || !draft.status || mutation.isPending} value={draft.note} onChange={(event) => update(student.id, { note: event.target.value })} /> : <p className="break-words whitespace-pre-wrap text-sm">{attendance?.note ?? '—'}</p>}</div>
      </li>;
    })}</ul>
    <div className="space-y-3 [&_nav]:flex-wrap [&_nav>div]:shrink-0"><Pagination {...roster.meta} onPage={(page) => { if (dirty.size > 0 && !window.confirm(t.unsavedPrompt)) return; onDirtyChange(false); onPage(page); }} /></div>
    {canEdit ? <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p role="status" aria-live="polite" className="text-sm font-medium">{mutation.isPending ? ui('saving') : dirty.size > 0 ? `${t.unsaved}: ${dirty.size}` : notice ?? ui('ready')}</p>
      <Button type="button" disabled={dirty.size === 0 || mutation.isPending} onClick={save}>{mutation.isPending ? ui('saving') : t.save}</Button>
    </div> : null}
  </div>;
}
