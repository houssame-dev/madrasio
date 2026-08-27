'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, AcademicYearDto, SubjectDto } from '@/lib/frontend/academic/types';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage, mapHomeworkValidation } from '@/lib/frontend/homework/errors';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import { homeworkFormSchema, type HomeworkFormValues } from '@/lib/frontend/homework/schemas';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';

export function HomeworkForm({ schoolId, years, subjects, assignments, onCancel }: {
  schoolId: string;
  years: AcademicYearDto[];
  subjects: SubjectDto[];
  assignments: TeacherAssignmentDto[];
  onCancel: () => void;
}) {
  const router = useRouter(); const queryClient = useQueryClient(); const [error, setError] = useState<string>();
  const form = useForm<HomeworkFormValues>({ resolver: zodResolver(homeworkFormSchema), defaultValues: { academicYearId: '', academicPeriodId: '', subjectId: '', title: '', description: '', dueDate: '' } });
  const yearId = form.watch('academicYearId'); const periodId = form.watch('academicPeriodId');
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId, `periods:${yearId || 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${yearId}/periods`), enabled: !!yearId });
  const yearIds = new Set(assignments.map((assignment) => assignment.academicYearId));
  const subjectIds = new Set(assignments.filter((assignment) => !yearId || assignment.academicYearId === yearId).map((assignment) => assignment.subjectId));
  const eligibleYears = years.filter((year) => (year.status === 'PLANNED' || year.status === 'ACTIVE') && yearIds.has(year.id));
  const eligiblePeriods = (periods.data ?? []).filter((period) => period.status !== 'CLOSED');
  const eligibleSubjects = subjects.filter((subject) => subject.status === 'ACTIVE' && subjectIds.has(subject.id));
  const mutation = useMutation({
    mutationFn: (values: HomeworkFormValues) => homeworkApi.create({ ...values, title: values.title.trim(), description: values.description.trim() || null }),
    onSuccess: async (homework) => { await queryClient.invalidateQueries({ queryKey: homeworkKeys.lists(schoolId) }); router.push(`/homework/${homework.id}`); },
    onError: (value) => { if (!mapHomeworkValidation(value, form.setError)) setError(homeworkErrorMessage(value)); },
  });
  const submit = (values: HomeworkFormValues) => {
    const year = years.find((item) => item.id === values.academicYearId); const period = periods.data?.find((item) => item.id === values.academicPeriodId);
    if (year && (values.dueDate < year.startDate || values.dueDate > year.endDate)) { form.setError('dueDate', { message: t.dueInsideYear }); return; }
    if (period && (values.dueDate < period.startDate || values.dueDate > period.endDate)) { form.setError('dueDate', { message: t.dueInsidePeriod }); return; }
    setError(undefined); mutation.mutate(values);
  };
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
    <Field label={t.academicYear} htmlFor="homework-year" error={form.formState.errors.academicYearId?.message}><select id="homework-year" className={selectClassName} {...form.register('academicYearId', { onChange: () => { form.setValue('academicPeriodId', ''); form.setValue('subjectId', ''); } })}><option value="">{t.selectYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={t.academicPeriod} htmlFor="homework-period" error={form.formState.errors.academicPeriodId?.message}><select id="homework-period" className={selectClassName} disabled={!yearId || periods.isPending} {...form.register('academicPeriodId')}><option value="">{t.selectPeriod}</option>{eligiblePeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></Field><Field label={t.subject} htmlFor="homework-subject" error={form.formState.errors.subjectId?.message}><select id="homework-subject" className={selectClassName} disabled={!yearId} {...form.register('subjectId')}><option value="">{t.selectSubject}</option>{eligibleSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></Field></div>
    <Field label={t.titleField} htmlFor="homework-title" error={form.formState.errors.title?.message}><input id="homework-title" className={inputClassName} {...form.register('title')} /></Field>
    <Field label={t.descriptionField} htmlFor="homework-description" error={form.formState.errors.description?.message} hint={t.plainText}><textarea id="homework-description" className={`${inputClassName} min-h-32 py-2`} {...form.register('description')} /></Field>
    <Field label={t.dueDate} htmlFor="homework-due" error={form.formState.errors.dueDate?.message}><input id="homework-due" type="date" className={inputClassName} min={periods.data?.find((item) => item.id === periodId)?.startDate} max={periods.data?.find((item) => item.id === periodId)?.endDate} {...form.register('dueDate')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.create} />
  </form>;
}
