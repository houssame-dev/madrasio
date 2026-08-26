'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { mapStudentValidation, studentErrorMessage } from '@/lib/frontend/students/errors';
import {
  endEnrollmentFormSchema, enrollmentFormSchema, transferFormSchema,
  type EndEnrollmentFormValues, type EnrollmentFormValues, type TransferFormValues,
} from '@/lib/frontend/students/schemas';
import type { EnrollmentDto } from '@/lib/frontend/students/types';

export function EnrollmentForm({ schoolId, studentId, years, initialYearId, onCancel, onSaved }: { schoolId: string; studentId: string; years: AcademicYearDto[]; initialYearId?: string; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const eligibleYears = years.filter((year) => year.status === 'PLANNED' || year.status === 'ACTIVE');
  const form = useForm<EnrollmentFormValues>({ resolver: zodResolver(enrollmentFormSchema), defaultValues: { academicYearId: initialYearId && eligibleYears.some((year) => year.id === initialYearId) ? initialYearId : eligibleYears[0]?.id ?? '', classId: '', effectiveFrom: '' } });
  const [error, setError] = useState<string>();
  const yearId = form.watch('academicYearId');
  const classes = useQuery({ queryKey: academicKeys.list(schoolId, 'classes', { academicYearId: yearId, status: 'ACTIVE', pageSize: 100 }), queryFn: () => listAllResource<ClassDto>('/api/v1/classes', { academicYearId: yearId, status: 'ACTIVE' }), enabled: !!yearId });
  useEffect(() => { form.setValue('classId', ''); }, [form, yearId]);
  const mutation = useMutation({ mutationFn: studentsApi.createEnrollment.bind(null, studentId), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapStudentValidation(value, form.setError)) setError(studentErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<p className="text-sm text-muted-foreground">{t.enrollmentSeparate}</p>
    <Field label={t.academicYear} htmlFor="enrollment-year" error={form.formState.errors.academicYearId?.message}><select id="enrollment-year" className={selectClassName} {...form.register('academicYearId')}><option value="">{t.selectYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} — {year.status}</option>)}</select></Field>
    <Field label={t.className} htmlFor="enrollment-class" error={form.formState.errors.classId?.message} hint={classes.data?.length === 0 ? t.noClasses : undefined}><select id="enrollment-class" className={selectClassName} disabled={!yearId || classes.isPending || classes.isError} {...form.register('classId')}><option value="">{t.selectClass}</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label={t.effectiveFrom} htmlFor="enrollment-from" error={form.formState.errors.effectiveFrom?.message}><input id="enrollment-from" type="date" className={inputClassName} {...form.register('effectiveFrom')} /></Field>
    {classes.isError ? <InlineFeedback kind="error">{t.noClasses}</InlineFeedback> : null}<FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.create} />
  </form>;
}

export function TransferForm({ studentId, year, classes, current, onCancel, onSaved }: { studentId: string; year: AcademicYearDto; classes: ClassDto[]; current: EnrollmentDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const targets = classes.filter((item) => item.status === 'ACTIVE' && item.id !== current.classId);
  const form = useForm<TransferFormValues>({ resolver: zodResolver(transferFormSchema), defaultValues: { academicYearId: year.id, toClassId: '', effectiveDate: '' } });
  const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: studentsApi.transfer.bind(null, studentId), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapStudentValidation(value, form.setError)) setError(studentErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => {
    if (values.effectiveDate <= current.effectiveFrom) { form.setError('effectiveDate', { message: t.transferDateAfter }); return; }
    mutation.mutate(values);
  })}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<InlineFeedback kind="success">{t.transferDescription}</InlineFeedback>
    <input type="hidden" {...form.register('academicYearId')} /><Field label={t.academicYear} htmlFor="transfer-year"><p id="transfer-year" className="rounded-md border bg-muted px-3 py-2 text-sm">{year.name}</p></Field>
    <Field label={t.targetClass} htmlFor="transfer-class" error={form.formState.errors.toClassId?.message} hint={targets.length === 0 ? t.noClasses : undefined}><select id="transfer-class" className={selectClassName} {...form.register('toClassId')}><option value="">{t.selectClass}</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label={t.transferDate} htmlFor="transfer-date" error={form.formState.errors.effectiveDate?.message}><input id="transfer-date" type="date" min={current.effectiveFrom} className={inputClassName} {...form.register('effectiveDate')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.confirm} />
  </form>;
}

export function EndEnrollmentForm({ enrollment, onCancel, onSaved }: { enrollment: EnrollmentDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<EndEnrollmentFormValues>({ resolver: zodResolver(endEnrollmentFormSchema), defaultValues: { effectiveUntil: '' } });
  const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: studentsApi.endEnrollment.bind(null, enrollment.id), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapStudentValidation(value, form.setError)) setError(studentErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => {
    if (values.effectiveUntil < enrollment.effectiveFrom) { form.setError('effectiveUntil', { message: t.endDateBefore }); return; }
    mutation.mutate(values);
  })}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<p className="text-sm text-muted-foreground">{t.endDescription}</p>
    <Field label={t.effectiveUntil} htmlFor="enrollment-until" error={form.formState.errors.effectiveUntil?.message}><input id="enrollment-until" type="date" min={enrollment.effectiveFrom} className={inputClassName} {...form.register('effectiveUntil')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.confirmEnd} />
  </form>;
}
