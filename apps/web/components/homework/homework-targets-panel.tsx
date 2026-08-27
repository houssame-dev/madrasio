'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback, SectionHeader } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';
import { invalidateHomeworkTargets } from '@/lib/frontend/homework/mutations';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import { targetFormSchema } from '@/lib/frontend/homework/schemas';
import type { HomeworkDto } from '@/lib/frontend/homework/types';
import type { ClassDto } from '@/lib/frontend/academic/types';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';

export function HomeworkTargetsPanel({ schoolId, role, homework, classes, assignments }: { schoolId: string; role: string; homework: HomeworkDto; classes: ClassDto[]; assignments: TeacherAssignmentDto[] }) {
  const queryClient = useQueryClient(); const [selected, setSelected] = useState<Set<string>>(new Set()); const [notice, setNotice] = useState<string>(); const [validation, setValidation] = useState<string>();
  const targets = useQuery({ queryKey: homeworkKeys.targets(schoolId, homework.id), queryFn: () => homeworkApi.targets(homework.id) });
  const targetIds = useMemo(() => new Set(targets.data?.map((target) => target.classId) ?? []), [targets.data]);
  const eligible = classes.filter((item) => item.academicYearId === homework.academicYearId && item.status === 'ACTIVE' && !targetIds.has(item.id) && (role !== 'TEACHER' || assignments.some((assignment) => assignment.classId === item.id && assignment.subjectId === homework.subjectId && assignment.academicYearId === homework.academicYearId)));
  const mutation = useMutation({ mutationFn: (classIds: string[]) => homeworkApi.addTargets(homework.id, classIds), onSuccess: async () => { await invalidateHomeworkTargets(queryClient, schoolId, homework.id); setSelected(new Set()); setNotice(t.targetsAdded); }, onError: (error) => setValidation(homeworkErrorMessage(error)) });
  const submit = () => { const parsed = targetFormSchema.safeParse({ classIds: [...selected] }); if (!parsed.success) { setValidation(parsed.error.issues[0]?.message); return; } setValidation(undefined); mutation.mutate(parsed.data.classIds); };
  if (targets.isPending) return <InlineLoading label={t.loading} />;
  if (targets.isError) return <section className="space-y-3"><SectionHeader title={t.targets} description="Target administration is unavailable when exact Teacher management scope is incomplete." /><ApiErrorState title={t.unavailable} description={homeworkErrorMessage(targets.error)} onRetry={() => void targets.refetch()} /></section>;
  return <section className="space-y-4"><SectionHeader title={t.targets} description={homework.status === 'DRAFT' ? t.targetHint : t.targetFrozen} />
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}{validation ? <InlineFeedback kind="error">{validation}</InlineFeedback> : null}
    {targets.data.length === 0 ? <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">{t.noTargets}</p> : <ul className="grid gap-2 sm:grid-cols-2">{targets.data.map((target) => <li key={target.id} className="rounded-md border bg-card px-3 py-2 text-sm"><span className="font-medium">{classes.find((item) => item.id === target.classId)?.name ?? target.classId}</span><span className="ms-2 text-xs text-muted-foreground">CLASS</span></li>)}</ul>}
    {homework.status === 'DRAFT' && eligible.length > 0 ? <div className="space-y-3 rounded-lg border p-4"><h3 className="font-medium">{t.addTargets}</h3><div className="grid gap-2 sm:grid-cols-2">{eligible.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={selected.has(item.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />{item.name}</label>)}</div><div className="flex justify-end"><Button type="button" disabled={mutation.isPending || selected.size === 0} onClick={submit}>{t.addTargets}</Button></div></div> : null}
  </section>;
}
