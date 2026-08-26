'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';
import { mapTeacherValidation, teacherErrorMessage } from '@/lib/frontend/teachers/errors';
import { assignmentFormSchema, endAssignmentFormSchema, type AssignmentFormValues, type EndAssignmentFormValues } from '@/lib/frontend/teachers/schemas';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';

export function AssignmentForm({ schoolId, teacherId, years, subjects, activeAssignments, onCancel, onSaved }: { schoolId: string; teacherId: string; years: AcademicYearDto[]; subjects: SubjectDto[]; activeAssignments: TeacherAssignmentDto[]; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const eligibleYears = years.filter((year) => year.status === 'PLANNED' || year.status === 'ACTIVE');
  const eligibleSubjects = subjects.filter((subject) => subject.status === 'ACTIVE');
  const form = useForm<AssignmentFormValues>({ resolver: zodResolver(assignmentFormSchema), defaultValues: { academicYearId: eligibleYears[0]?.id ?? '', classId: '', subjectId: '', effectiveFrom: '' } });
  const [error, setError] = useState<string>(); const yearId = form.watch('academicYearId');
  const classes = useQuery({ queryKey: academicKeys.list(schoolId, 'classes', { academicYearId: yearId, status: 'ACTIVE', pageSize: 100 }), queryFn: () => listAllResource<ClassDto>('/api/v1/classes', { academicYearId: yearId, status: 'ACTIVE' }), enabled: !!yearId });
  useEffect(() => { form.setValue('classId', ''); }, [form, yearId]);
  const mutation = useMutation({ mutationFn: teachersApi.createAssignment.bind(null, teacherId), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapTeacherValidation(value, form.setError)) setError(teacherErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => {
    if (activeAssignments.some((assignment) => assignment.academicYearId === values.academicYearId && assignment.classId === values.classId && assignment.subjectId === values.subjectId)) { setError(t.duplicateSelection); return; }
    mutation.mutate(values);
  })}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<p className="text-sm text-muted-foreground">{t.assignmentSeparate}</p>
    <Field label={t.academicYear} htmlFor="assignment-year" error={form.formState.errors.academicYearId?.message}><select id="assignment-year" className={selectClassName} {...form.register('academicYearId')}><option value="">{t.selectYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} — {year.status}</option>)}</select></Field>
    <Field label={t.className} htmlFor="assignment-class" error={form.formState.errors.classId?.message} hint={classes.data?.length === 0 ? t.noClasses : undefined}><select id="assignment-class" className={selectClassName} disabled={!yearId || classes.isPending || classes.isError} {...form.register('classId')}><option value="">{t.selectClass}</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label={t.subject} htmlFor="assignment-subject" error={form.formState.errors.subjectId?.message} hint={eligibleSubjects.length === 0 ? t.noSubjects : undefined}><select id="assignment-subject" className={selectClassName} {...form.register('subjectId')}><option value="">{t.selectSubject}</option>{eligibleSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></Field>
    <Field label={t.effectiveFrom} htmlFor="assignment-from" error={form.formState.errors.effectiveFrom?.message}><input id="assignment-from" type="date" className={inputClassName} {...form.register('effectiveFrom')} /></Field>
    {classes.isError ? <InlineFeedback kind="error">{t.noClasses}</InlineFeedback> : null}<FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.create} />
  </form>;
}

export function EndAssignmentForm({ assignment, onCancel, onSaved }: { assignment: TeacherAssignmentDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<EndAssignmentFormValues>({ resolver: zodResolver(endAssignmentFormSchema), defaultValues: { effectiveUntil: '' } }); const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: teachersApi.endAssignment.bind(null, assignment.id), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapTeacherValidation(value, form.setError)) setError(teacherErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => { if (values.effectiveUntil < assignment.effectiveFrom) { form.setError('effectiveUntil', { message: t.endDateBefore }); return; } mutation.mutate(values); })}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<p className="text-sm text-muted-foreground">{t.endDescription}</p><p className="text-sm text-muted-foreground">{t.reassignmentSeparate}</p>
    <Field label={t.effectiveUntil} htmlFor="assignment-until" error={form.formState.errors.effectiveUntil?.message}><input id="assignment-until" type="date" min={assignment.effectiveFrom} className={inputClassName} {...form.register('effectiveUntil')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.confirmEnd} />
  </form>;
}
