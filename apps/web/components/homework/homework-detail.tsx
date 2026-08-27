'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@school/ui';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { Field, FormActions, InlineFeedback, Modal, StatusBadge, inputClassName } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { academicApi, listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { currentUserHomeworkAssignments, homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage, mapHomeworkValidation } from '@/lib/frontend/homework/errors';
import { invalidateHomework } from '@/lib/frontend/homework/mutations';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import { homeworkEditSchema, type HomeworkEditValues } from '@/lib/frontend/homework/schemas';
import type { HomeworkDto } from '@/lib/frontend/homework/types';
import { parentKeys } from '@/lib/frontend/parents/queries';
import { parentsApi } from '@/lib/frontend/parents/api';
import { can } from '@/lib/frontend/permissions';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { teacherKeys } from '@/lib/frontend/teachers/queries';
import { HomeworkLifecycleActions } from './homework-lifecycle-actions';
import { HomeworkRoster } from './homework-roster';
import { HomeworkTargetsPanel } from './homework-targets-panel';

export function HomeworkDetailWorkspace({ homeworkId }: { homeworkId: string }) {
  const app = useAppContext(); const schoolId = app.currentSchool?.id; const role = app.currentSchool?.role;
  if (!schoolId || !role || !can(role, 'homework.read')) return <AccessDeniedWithReturn />;
  return role === 'PARENT' ? <ParentHomeworkDetail schoolId={schoolId} homeworkId={homeworkId} /> : <StaffHomeworkDetail schoolId={schoolId} role={role} userId={app.user.id} homeworkId={homeworkId} />;
}

function ParentHomeworkDetail({ schoolId, homeworkId }: { schoolId: string; homeworkId: string }) {
  const detail = useQuery({ queryKey: homeworkKeys.detail(schoolId, homeworkId), queryFn: () => homeworkApi.detail(homeworkId) });
  const submissions = useQuery({ queryKey: homeworkKeys.submissions(schoolId, homeworkId, { page: 1, pageSize: 100 }), queryFn: () => homeworkApi.submissions(homeworkId, { page: 1, pageSize: 100 }), enabled: detail.isSuccess });
  const profiles = useQuery({ queryKey: parentKeys.selfProfiles(schoolId), queryFn: parentsApi.selfProfiles });
  if (detail.isPending || profiles.isPending) return <InlineLoading label={t.loading} />;
  if (detail.isError || profiles.isError) return <ApiErrorState title={t.unavailable} description={homeworkErrorMessage(detail.error ?? profiles.error)} onRetry={() => { void detail.refetch(); void profiles.refetch(); }} />;
  const children = new Map(profiles.data.flatMap((profile) => profile.children).map((child) => [child.student.id, `${child.student.firstName} ${child.student.lastName}`]));
  return <div className="mx-auto max-w-4xl space-y-6"><Link href="/children" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t.backToChildren}</Link><header><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{detail.data.title}</h1><StatusBadge status={detail.data.status} /></div><p className="mt-2 text-sm text-muted-foreground">{t.parentReadOnlyHint}</p></header><section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{t.overview}</h2><dl className="grid gap-3 sm:grid-cols-2"><Info label={t.dueDate} value={detail.data.dueDate} /><Info label={t.status} value={detail.data.status} /></dl>{detail.data.description ? <p className="whitespace-pre-wrap text-sm">{detail.data.description}</p> : null}</section><section className="space-y-3"><h2 className="text-lg font-semibold">{t.parentReadOnly}</h2>{submissions.isPending ? <InlineLoading label={t.loading} /> : submissions.isError ? <ApiErrorState title={t.unavailable} description={homeworkErrorMessage(submissions.error)} onRetry={() => void submissions.refetch()} /> : submissions.data.data.length === 0 ? <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">{t.noChildSubmissions}</p> : submissions.data.data.map((submission) => <article key={submission.id} className="space-y-2 rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{children.get(submission.studentId) ?? t.relatedChild}</h3><StatusBadge status={submission.status} /></div><p className="text-xs text-muted-foreground">{t.submittedAt}: {new Date(submission.submittedAt).toLocaleString()}</p><p className="whitespace-pre-wrap text-sm">{submission.content ?? '—'}</p></article>)}</section></div>;
}

function StaffHomeworkDetail({ schoolId, role, userId, homeworkId }: { schoolId: string; role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER'; userId: string; homeworkId: string }) {
  const [editing, setEditing] = useState(false); const detail = useQuery({ queryKey: homeworkKeys.detail(schoolId, homeworkId), queryFn: () => homeworkApi.detail(homeworkId) });
  const years = useQuery({ queryKey: academicKeys.selectors(schoolId, 'years'), queryFn: academicApi.allYears });
  const subjects = useQuery({ queryKey: academicKeys.selectors(schoolId, 'subjects'), queryFn: () => listAllResource<SubjectDto>('/api/v1/subjects') });
  const classes = useQuery({ queryKey: academicKeys.selectors(schoolId, 'classes'), queryFn: () => listAllResource<ClassDto>('/api/v1/classes') });
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId, `periods:${detail.data?.academicYearId ?? 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${detail.data!.academicYearId}/periods`), enabled: !!detail.data });
  const scope = useQuery({ queryKey: homeworkKeys.authorScope(schoolId, userId), queryFn: () => currentUserHomeworkAssignments(userId) });
  const author = useQuery({ queryKey: teacherKeys.detail(schoolId, detail.data?.teacherId ?? 'none'), queryFn: () => teachersApi.detail(detail.data!.teacherId), enabled: !!detail.data });
  if (detail.isPending) return <InlineLoading label={t.loading} />;
  if (detail.isError) return <ApiErrorState title={t.unavailable} description={homeworkErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />;
  if (years.isPending || subjects.isPending || classes.isPending || periods.isPending || scope.isPending || author.isPending) return <InlineLoading label={t.loading} />;
  if (years.isError || subjects.isError || classes.isError || periods.isError || scope.isError || author.isError) return <ApiErrorState title={t.unavailable} description={homeworkErrorMessage(years.error ?? subjects.error ?? classes.error ?? periods.error ?? scope.error ?? author.error)} onRetry={() => { void years.refetch(); void subjects.refetch(); void classes.refetch(); void periods.refetch(); void scope.refetch(); void author.refetch(); }} />;
  const homework = detail.data; const year = years.data.find((item) => item.id === homework.academicYearId); const period = periods.data.find((item) => item.id === homework.academicPeriodId); const subject = subjects.data.find((item) => item.id === homework.subjectId); const canManage = can(role, 'homework.manage');
  return <div className="mx-auto max-w-[110rem] space-y-7"><Link href="/homework" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t.back}</Link><header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{homework.title}</h1><StatusBadge status={homework.status} /></div><p className="mt-1 text-sm text-muted-foreground">{subject?.name ?? '—'} · {year?.name ?? '—'} · {period?.name ?? '—'}</p></div>{canManage ? <div className="flex flex-wrap gap-2">{homework.status === 'DRAFT' ? <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" />{t.edit}</Button> : null}<HomeworkLifecycleActions schoolId={schoolId} homeworkId={homework.id} status={homework.status} /></div> : null}</header>
    <section className="space-y-4 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{t.overview}</h2><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label={t.academicYear} value={year?.name ?? '—'} /><Info label={t.academicPeriod} value={period?.name ?? '—'} /><Info label={t.subject} value={subject?.name ?? '—'} /><Info label={t.dueDate} value={homework.dueDate} /><Info label={t.author} value={`${author.data.firstName} ${author.data.lastName}`} /></dl><div><h3 className="text-xs uppercase text-muted-foreground">{t.descriptionField}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{homework.description ?? '—'}</p></div></section>
    <HomeworkTargetsPanel schoolId={schoolId} role={role} homework={homework} classes={classes.data} assignments={scope.data} /><HomeworkRoster schoolId={schoolId} homework={homework} />
    <Modal open={editing} title={t.edit} description={t.plainText} onClose={() => setEditing(false)}>{editing ? <HomeworkEditForm schoolId={schoolId} homework={homework} year={year} period={period} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} /> : null}</Modal>
  </div>;
}

function HomeworkEditForm({ schoolId, homework, year, period, onCancel, onSaved }: { schoolId: string; homework: HomeworkDto; year?: { startDate: string; endDate: string }; period?: { startDate: string; endDate: string }; onCancel: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient(); const [error, setError] = useState<string>(); const form = useForm<HomeworkEditValues>({ resolver: zodResolver(homeworkEditSchema), defaultValues: { title: homework.title, description: homework.description ?? '', dueDate: homework.dueDate } });
  const mutation = useMutation({ mutationFn: (values: HomeworkEditValues) => homeworkApi.patch(homework.id, { title: values.title.trim(), description: values.description.trim() || null, dueDate: values.dueDate }), onSuccess: async () => { await invalidateHomework(queryClient, schoolId, homework.id, true); onSaved(); }, onError: (value) => { if (!mapHomeworkValidation(value, form.setError)) setError(homeworkErrorMessage(value)); } });
  const submit = (values: HomeworkEditValues) => { if (year && (values.dueDate < year.startDate || values.dueDate > year.endDate)) { form.setError('dueDate', { message: t.dueInsideYear }); return; } if (period && (values.dueDate < period.startDate || values.dueDate > period.endDate)) { form.setError('dueDate', { message: t.dueInsidePeriod }); return; } mutation.mutate(values); };
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>{error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<Field label={t.titleField} htmlFor="homework-edit-title" error={form.formState.errors.title?.message}><input id="homework-edit-title" className={inputClassName} {...form.register('title')} /></Field><Field label={t.descriptionField} htmlFor="homework-edit-description" error={form.formState.errors.description?.message}><textarea id="homework-edit-description" className={`${inputClassName} min-h-32 py-2`} {...form.register('description')} /></Field><Field label={t.dueDate} htmlFor="homework-edit-due" error={form.formState.errors.dueDate?.message}><input id="homework-edit-due" type="date" className={inputClassName} min={period?.startDate} max={period?.endDate} {...form.register('dueDate')} /></Field><FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.save} /></form>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>; }
