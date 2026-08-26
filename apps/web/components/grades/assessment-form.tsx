'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage, mapGradeValidation } from '@/lib/frontend/grades/errors';
import { assessmentFormSchema, assessmentTypes, type AssessmentFormValues } from '@/lib/frontend/grades/schemas';
import type { AssessmentDto } from '@/lib/frontend/grades/types';

export function AssessmentForm({ gradebookId, period, initial, onCancel, onSaved }: {
  gradebookId: string;
  period: { startDate: string; endDate: string };
  initial?: AssessmentDto;
  onCancel: () => void;
  onSaved: (value: AssessmentDto) => Promise<void> | void;
}) {
  const [error, setError] = useState<string>();
  const form = useForm<AssessmentFormValues>({ resolver: zodResolver(assessmentFormSchema), defaultValues: {
    title: initial?.title ?? '', assessmentType: initial?.assessmentType ?? 'QUIZ', maximumScore: initial?.maximumScore ?? '', weight: initial?.weight ?? '1', assessmentDate: initial?.assessmentDate ?? '',
  } });
  const mutation = useMutation({
    mutationFn: (values: AssessmentFormValues) => {
      const input = { ...values, assessmentDate: values.assessmentDate || null };
      return initial ? gradesApi.patchAssessment(initial.id, input) : gradesApi.createAssessment(gradebookId, input);
    },
    onSuccess: async (value) => { setError(undefined); await onSaved(value); },
    onError: (value) => { if (!mapGradeValidation(value, form.setError)) setError(gradeErrorMessage(value)); },
  });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => {
    if (values.assessmentDate && (values.assessmentDate < period.startDate || values.assessmentDate > period.endDate)) { form.setError('assessmentDate', { message: t.dateHint(period.startDate, period.endDate) }); return; }
    mutation.mutate(values);
  })}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
    <Field label={t.titleField} htmlFor="assessment-title" error={form.formState.errors.title?.message}><input id="assessment-title" className={inputClassName} aria-invalid={!!form.formState.errors.title} {...form.register('title')} /></Field>
    <Field label={t.type} htmlFor="assessment-type" error={form.formState.errors.assessmentType?.message}><select id="assessment-type" className={selectClassName} {...form.register('assessmentType')}>{assessmentTypes.map((value) => <option key={value} value={value}>{t.typeLabels[value]}</option>)}</select></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={t.maximumScore} htmlFor="assessment-maximum" error={form.formState.errors.maximumScore?.message} hint={t.decimalHint}><input id="assessment-maximum" type="text" inputMode="decimal" className={inputClassName} aria-invalid={!!form.formState.errors.maximumScore} {...form.register('maximumScore')} /></Field><Field label={t.weight} htmlFor="assessment-weight" error={form.formState.errors.weight?.message} hint={t.weightHint}><input id="assessment-weight" type="text" inputMode="decimal" className={inputClassName} aria-invalid={!!form.formState.errors.weight} {...form.register('weight')} /></Field></div>
    <Field label={`${t.date} (${t.optional})`} htmlFor="assessment-date" error={form.formState.errors.assessmentDate?.message} hint={t.dateHint(period.startDate, period.endDate)}><input id="assessment-date" type="date" className={inputClassName} aria-invalid={!!form.formState.errors.assessmentDate} {...form.register('assessmentDate')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} />
  </form>;
}
