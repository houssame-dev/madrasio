'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@school/ui';
import { Field, InlineFeedback, Modal, Pagination, inputClassName, selectClassName } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage } from '@/lib/frontend/grades/errors';
import { gradeKeys, invalidateAfterGradeSave } from '@/lib/frontend/grades/queries';
import type { AssessmentDto, GradeEntryInput, GradeState } from '@/lib/frontend/grades/types';

type Draft = { state: GradeState | ''; score: string };
const states: readonly GradeState[] = ['VALID', 'MISSING', 'ABSENT', 'EXCUSED'];
const decimal = /^\d{1,4}(?:\.\d{1,2})?$/;

function scaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function GradeEntryDialog({ open, schoolId, gradebookId, assessment, onClose }: {
  open: boolean;
  schoolId: string;
  gradebookId: string;
  assessment: AssessmentDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient(); const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}); const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const seededMatrix = useRef<string>();
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const matrix = useQuery({ queryKey: gradeKeys.gradeMatrix(schoolId, gradebookId, page), queryFn: () => gradesApi.gradeMatrix(gradebookId, { page, pageSize: 100 }), enabled: open && !!assessment });
  const rows = matrix.data?.data.students;
  useEffect(() => {
    if (!open) { seededMatrix.current = undefined; return; }
    if (!assessment || !rows) return;
    const seedKey = `${assessment.id}:${page}`;
    if (seededMatrix.current === seedKey) return;
    seededMatrix.current = seedKey;
    setDrafts(Object.fromEntries(rows.map(({ student, grades }) => {
      const grade = grades.find((value) => value.assessmentId === assessment.id);
      return [student.id, { state: grade?.state ?? '', score: grade?.score ?? '' } satisfies Draft];
    })));
    setDirty(new Set());
  }, [assessment, open, page, rows]);
  useEffect(() => { setNotice(undefined); setErrors({}); }, [assessment?.id, open, page]);
  useEffect(() => {
    if (!open || dirty.size === 0) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty.size, open]);
  const close = useCallback(() => { if (dirtyRef.current.size === 0 || window.confirm(t.unsavedPrompt)) onClose(); }, [onClose]);
  const payload = useMemo(() => [...dirty].flatMap((studentId): GradeEntryInput[] => {
    const draft = drafts[studentId];
    return draft?.state ? [{ studentId, state: draft.state, score: draft.state === 'VALID' ? draft.score : null }] : [];
  }), [dirty, drafts]);
  const mutation = useMutation({
    mutationFn: (grades: GradeEntryInput[]) => gradesApi.putAssessmentGrades(assessment!.id, grades),
    onSuccess: async () => { await invalidateAfterGradeSave(queryClient, schoolId, gradebookId); await matrix.refetch(); setDirty(new Set()); setNotice(t.gradeBatchSaved); },
  });
  const change = (studentId: string, update: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [studentId]: { ...current[studentId], ...update } }));
    setErrors((current) => { const next = { ...current }; delete next[studentId]; return next; });
    setDirty((current) => new Set(current).add(studentId)); setNotice(undefined);
    if (mutation.isError) mutation.reset();
  };
  const save = () => {
    if (dirty.size === 0) { setNotice(undefined); return; }
    let invalid = false;
    const nextErrors: Record<string, string> = {};
    for (const studentId of dirty) {
      const draft = drafts[studentId];
      let error: string | undefined;
      if (!draft?.state) error = t.selectState;
      else if (draft.state === 'VALID' && !draft.score) error = t.scoreRequired;
      else if (draft.state === 'VALID' && !decimal.test(draft.score)) error = t.scoreInvalid;
      else if (draft.state === 'VALID' && scaled(draft.score) > scaled(assessment!.maximumScore)) error = t.scoreAboveMaximum(assessment!.maximumScore);
      if (error) { nextErrors[studentId] = error; invalid = true; }
    }
    setErrors(nextErrors);
    if (!invalid) mutation.mutate(payload);
  };
  return <Modal open={open} title={assessment ? t.gradeEntryTitle(assessment.title) : t.enterGrades} description={assessment ? t.gradeEntryDescription(assessment.maximumScore) : undefined} onClose={close}>
    {!assessment ? null : matrix.isPending ? <InlineLoading label={t.loading} /> : matrix.isError ? <ApiErrorState title={t.unavailable} onRetry={() => void matrix.refetch()} /> : <div className="space-y-4">
      {dirty.size > 0 ? <InlineFeedback kind="error">{t.unsavedChanges}: {dirty.size}</InlineFeedback> : null}
      {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
      {mutation.isError ? <InlineFeedback kind="error">{gradeErrorMessage(mutation.error)}</InlineFeedback> : null}
      <p className="text-xs text-muted-foreground">{t.rosterLimit}</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[42rem] text-sm"><thead className="border-b bg-muted/60"><tr><th className="px-4 py-3 text-start">{t.student}</th><th className="px-4 py-3 text-start">{t.gradeState}</th><th className="px-4 py-3 text-start">{t.score}</th></tr></thead><tbody className="divide-y">{rows?.map(({ student }) => {
        const name = `${student.firstName} ${student.lastName}`; const draft = drafts[student.id] ?? { state: '', score: '' };
        const error = errors[student.id];
        return <tr key={student.id}><th scope="row" className="px-4 py-3 text-start font-medium">{name}<span className="block text-xs font-normal text-muted-foreground">{student.studentCode ?? t.none}</span></th><td className="px-4 py-3"><label className="sr-only" htmlFor={`grade-state-${student.id}`}>{t.stateFor(name)}</label><select id={`grade-state-${student.id}`} aria-label={t.stateFor(name)} className={selectClassName} value={draft.state} onChange={(event) => { const state = event.target.value as GradeState | ''; change(student.id, { state, score: state === 'VALID' ? draft.score : '' }); }}><option value="">{t.selectState}</option>{states.map((state) => <option key={state} value={state}>{t.gradeStates[state]}</option>)}</select></td><td className="px-4 py-3"><Field label="" htmlFor={`grade-score-${student.id}`} error={error}><input id={`grade-score-${student.id}`} aria-label={t.scoreFor(name)} aria-invalid={!!error} className={inputClassName} inputMode="decimal" disabled={draft.state !== 'VALID'} value={draft.score} onChange={(event) => change(student.id, { score: event.target.value })} /></Field></td></tr>;
      })}</tbody></table></div>
      {matrix.data ? <Pagination page={matrix.data.meta.page} pageSize={matrix.data.meta.pageSize} total={matrix.data.meta.total} onPage={(next) => { if (dirty.size === 0 || window.confirm(t.unsavedPrompt)) setPage(next); }} /> : null}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={close}>{t.cancel}</Button><Button type="button" disabled={mutation.isPending || dirty.size === 0} onClick={save}>{t.save}</Button></div>
    </div>}
  </Modal>;
}
