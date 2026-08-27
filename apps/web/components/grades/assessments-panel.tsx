'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPen, Pencil, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@school/ui';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, StatusBadge, TableShell, selectClassName } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeKeys, invalidateGradebook } from '@/lib/frontend/grades/queries';
import type { AssessmentDto, AssessmentStatus, AssessmentType, GradebookDto } from '@/lib/frontend/grades/types';
import { AssessmentForm } from './assessment-form';
import { AssessmentLifecycleActions } from './assessment-lifecycle-actions';
import { GradeEntryDialog } from './grade-entry/grade-entry-dialog';

const statuses: readonly AssessmentStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const types: readonly AssessmentType[] = ['QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK'];

export function AssessmentsPanel({ schoolId, gradebook, period, canManage }: {
  schoolId: string;
  gradebook: GradebookDto;
  period: { startDate: string; endDate: string; status: 'PLANNED' | 'ACTIVE' | 'CLOSED' };
  canManage: boolean;
}) {
  const searchParams = useSearchParams(); const pathname = usePathname(); const router = useRouter(); const queryClient = useQueryClient();
  const pageValue = Number(searchParams.get('assessmentPage') ?? '1'); const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const statusValue = searchParams.get('assessmentStatus'); const status = statuses.includes(statusValue as AssessmentStatus) ? statusValue as AssessmentStatus : undefined;
  const typeValue = searchParams.get('assessmentType'); const assessmentType = types.includes(typeValue as AssessmentType) ? typeValue as AssessmentType : undefined;
  const params = { page, pageSize: 20, status, assessmentType };
  const query = useQuery({ queryKey: gradeKeys.assessmentList(schoolId, gradebook.id, params), queryFn: () => gradesApi.assessments(gradebook.id, params) });
  const [editing, setEditing] = useState<AssessmentDto | null | undefined>(); const [notice, setNotice] = useState<string>();
  const [grading, setGrading] = useState<AssessmentDto | null>(null);
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => { const next = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(updates)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); } const suffix = next.toString(); router.replace(`${pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false }); }, [pathname, router, searchParams]);
  const mutableGradebook = gradebook.status === 'DRAFT' || gradebook.status === 'OPEN';
  const canCreate = canManage && mutableGradebook && period.status !== 'CLOSED';
  const changed = async (message: string = t.changesSaved) => { await invalidateGradebook(queryClient, schoolId, gradebook.id); setNotice(message); };
  return <section className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold">{t.assessments}</h2><p className="mt-1 text-sm text-muted-foreground">{t.assessmentsDescription}</p></div>{canCreate ? <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createAssessment}</Button> : null}</div>
    {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
    {canManage && !mutableGradebook ? <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">{t.gradebookReadOnly}</p> : null}
    {canManage && mutableGradebook && period.status === 'CLOSED' ? <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">{t.periodClosed}</p> : null}
    <div className="flex flex-col gap-2 sm:flex-row"><label className="sm:w-56"><span className="sr-only">{t.assessmentStatusFilter}</span><select aria-label={t.assessmentStatusFilter} className={selectClassName} value={status ?? ''} onChange={(event) => updateUrl({ assessmentStatus: event.target.value || undefined, assessmentPage: 1 })}><option value="">{t.allStatuses}</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="sm:w-56"><span className="sr-only">{t.assessmentTypeFilter}</span><select aria-label={t.assessmentTypeFilter} className={selectClassName} value={assessmentType ?? ''} onChange={(event) => updateUrl({ assessmentType: event.target.value || undefined, assessmentPage: 1 })}><option value="">{t.allTypes}</option>{types.map((value) => <option key={value} value={value}>{t.typeLabels[value]}</option>)}</select></label></div>
    {query.isError ? <ApiErrorState title={t.unavailable} onRetry={() => void query.refetch()} /> : <div className="space-y-4"><TableShell headers={[t.titleField, t.type, t.maximumScore, t.weight, t.date, t.status, t.actions]} loading={query.isPending}>{query.data?.data.length === 0 ? <EmptyTableRow columns={7} /> : query.data?.data.map((assessment) => <tr key={assessment.id}><td className="px-4 py-3 font-medium">{assessment.title}</td><td className="px-4 py-3">{t.typeLabels[assessment.assessmentType]}</td><td className="px-4 py-3 tabular-nums">{assessment.maximumScore}</td><td className="px-4 py-3 tabular-nums">{assessment.weight}</td><td className="px-4 py-3">{assessment.assessmentDate ?? t.none}</td><td className="px-4 py-3"><StatusBadge status={assessment.status} /></td><td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2">{canManage && gradebook.status === 'OPEN' && assessment.status === 'PUBLISHED' ? <Button type="button" variant="outline" size="sm" onClick={() => setGrading(assessment)}><ClipboardPen className="size-4" aria-hidden="true" />{t.enterGrades}</Button> : null}{canManage && mutableGradebook && assessment.status === 'DRAFT' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.editAssessment}: ${assessment.title}`} onClick={() => setEditing(assessment)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}{canManage && mutableGradebook ? <AssessmentLifecycleActions assessment={assessment} onSaved={() => changed()} /> : null}</div></td></tr>)}</TableShell>{query.data ? <Pagination {...query.data.meta} onPage={(next) => updateUrl({ assessmentPage: next })} /> : null}</div>}
    <Modal open={editing !== undefined} title={editing ? t.editAssessment : t.createAssessment} description={t.weightHint} onClose={() => setEditing(undefined)}>{editing !== undefined ? <AssessmentForm gradebookId={gradebook.id} period={period} initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await changed(editing ? t.changesSaved : t.assessmentCreated); setEditing(undefined); }} /> : null}</Modal>
    <GradeEntryDialog open={grading !== null} schoolId={schoolId} gradebookId={gradebook.id} assessment={grading} onClose={() => setGrading(null)} />
  </section>;
}
