'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@school/ui';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage, mapGradeValidation } from '@/lib/frontend/grades/errors';
import { gradeKeys } from '@/lib/frontend/grades/queries';
import { gradebookFormSchema, type GradebookFormValues } from '@/lib/frontend/grades/schemas';
import type { GradingConfigurationVersionOptionDto } from '@/lib/frontend/grades/types';

export function GradebookForm({ schoolId, years, classes, subjects, versions, versionsPending, versionsError, refetchVersions, onCancel }: {
  schoolId: string;
  years: AcademicYearDto[];
  classes: ClassDto[];
  subjects: SubjectDto[];
  versions: GradingConfigurationVersionOptionDto[];
  versionsPending: boolean;
  versionsError: boolean;
  refetchVersions: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const router = useRouter(); const queryClient = useQueryClient(); const [error, setError] = useState<string>();
  const form = useForm<GradebookFormValues>({ resolver: zodResolver(gradebookFormSchema), defaultValues: { name: '', academicYearId: '', academicPeriodId: '', classId: '', subjectId: '', gradingConfigurationVersionId: '' } });
  const yearId = form.watch('academicYearId');
  const periods = useQuery({ queryKey: academicKeys.selectors(schoolId, `periods:${yearId || 'none'}`), queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${yearId}/periods`), enabled: !!yearId });
  const eligibleYears = years.filter((row) => row.status === 'PLANNED' || row.status === 'ACTIVE');
  const eligiblePeriods = (periods.data ?? []).filter((row) => row.status === 'PLANNED' || row.status === 'ACTIVE');
  const eligibleClasses = classes.filter((row) => row.academicYearId === yearId && row.status === 'ACTIVE');
  const eligibleSubjects = subjects.filter((row) => row.status === 'ACTIVE');
  const mutation = useMutation({
    mutationFn: (values: GradebookFormValues) => gradesApi.createGradebook({ ...values, name: values.name.trim() || null }),
    onSuccess: async (value) => { await queryClient.invalidateQueries({ queryKey: gradeKeys.gradebooks(schoolId) }); router.push(`/grades/${value.id}`); },
    onError: async (value) => {
      if (!mapGradeValidation(value, form.setError)) setError(gradeErrorMessage(value));
      const featureCode = value && typeof value === 'object' && 'featureCode' in value ? value.featureCode : undefined;
      if (featureCode === 'INVALID_GRADEBOOK_CONTEXT') await refetchVersions();
    },
  });
  if (versionsPending) return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  if (versionsError) return <InlineFeedback kind="error"><span>{t.configurationVersionsUnavailable}</span><Button type="button" variant="outline" size="sm" onClick={() => void refetchVersions()}>{t.retry}</Button></InlineFeedback>;
  if (versions.length === 0) return <div className="space-y-3"><InlineFeedback kind="error"><span><strong>{t.noConfigurationVersions}</strong> {t.noConfigurationVersionsDescription}</span></InlineFeedback><div className="flex justify-end"><Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button></div></div>;
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
    <Field label={t.optionalName} htmlFor="gradebook-name" error={form.formState.errors.name?.message}><input id="gradebook-name" className={inputClassName} {...form.register('name')} /></Field>
    <Field label={t.academicYear} htmlFor="gradebook-year" error={form.formState.errors.academicYearId?.message}><select id="gradebook-year" className={selectClassName} {...form.register('academicYearId', { onChange: () => { form.setValue('academicPeriodId', ''); form.setValue('classId', ''); } })}><option value="">{t.selectYear}</option>{eligibleYears.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={t.period} htmlFor="gradebook-period" error={form.formState.errors.academicPeriodId?.message}><select id="gradebook-period" className={selectClassName} disabled={!yearId || periods.isPending} {...form.register('academicPeriodId')}><option value="">{t.selectPeriod}</option>{eligiblePeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label={t.class} htmlFor="gradebook-class" error={form.formState.errors.classId?.message}><select id="gradebook-class" className={selectClassName} disabled={!yearId} {...form.register('classId')}><option value="">{t.selectClass}</option>{eligibleClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field></div>
    <Field label={t.subject} htmlFor="gradebook-subject" error={form.formState.errors.subjectId?.message}><select id="gradebook-subject" className={selectClassName} {...form.register('subjectId')}><option value="">{t.selectSubject}</option>{eligibleSubjects.map((row) => <option key={row.id} value={row.id}>{row.name}{row.code ? ` (${row.code})` : ''}</option>)}</select></Field>
    <Field label={t.configurationVersion} htmlFor="gradebook-version" error={form.formState.errors.gradingConfigurationVersionId?.message}><select id="gradebook-version" className={selectClassName} {...form.register('gradingConfigurationVersionId')}><option value="">{t.selectConfigurationVersion}</option>{versions.map((row) => <option key={row.id} value={row.id}>{t.versionLabel(row.configuration.name, row.versionNumber)}</option>)}</select></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.create} />
  </form>;
}
