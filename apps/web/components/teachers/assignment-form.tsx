'use client';
import { usePeopleText } from '@/i18n/use-people-text';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from '@/components/academic/ui';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicYearDto, ClassDto, SubjectDto } from '@/lib/frontend/academic/types';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { useTeacherCopy } from '@/i18n/use-people-copy';
import { mapTeacherValidation, teacherErrorMessage } from '@/lib/frontend/teachers/errors';
import { assignmentFormSchema, endAssignmentFormSchema, type AssignmentFormValues, type EndAssignmentFormValues } from '@/lib/frontend/teachers/schemas';
import type { TeacherAssignmentDto } from '@/lib/frontend/teachers/types';

export function AssignmentForm({ schoolId, teacherId, years, subjects, activeAssignments, onCancel, onSaved, personLabel }: { personLabel?: string; schoolId: string; teacherId: string; years: AcademicYearDto[]; subjects: SubjectDto[]; activeAssignments: TeacherAssignmentDto[]; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const t = useTeacherCopy();
  const text = usePeopleText();

  const eligibleYears = years.filter((year) => year.status === 'PLANNED' || year.status === 'ACTIVE');
  const eligibleSubjects = subjects.filter((subject) => subject.status === 'ACTIVE');
  const form = useForm<AssignmentFormValues>({ resolver: zodResolver(assignmentFormSchema), defaultValues: { academicYearId: (eligibleYears.length===1 ? eligibleYears[0]?.id : '') ?? '', classId: '', subjectId: '', effectiveFrom: '' } });
  const [error, setError] = useState<string>(); const yearId = form.watch('academicYearId');
  const classes = useQuery({ queryKey: academicKeys.list(schoolId, 'classes', { academicYearId: yearId, status: 'ACTIVE', pageSize: 100 }), queryFn: () => listAllResource<ClassDto>('/api/v1/classes', { academicYearId: yearId, status: 'ACTIVE' }), enabled: !!yearId });
  useEffect(() => { form.setValue('classId', ''); }, [form, yearId]);
  const mutation = useMutation({ mutationFn: teachersApi.createAssignment.bind(null, teacherId), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapTeacherValidation(value, form.setError)) setError(text(teacherErrorMessage(value))); } });
  return <form className="pp-workspace pp-form space-y-4" noValidate onSubmit={form.handleSubmit((values) => {
    if (activeAssignments.some((assignment) => assignment.academicYearId === values.academicYearId && assignment.classId === values.classId && assignment.subjectId === values.subjectId)) { setError(t.duplicateSelection); return; }
    mutation.mutate(values);
  })}>
    {error ? <InlineFeedback brand kind="error">{error}</InlineFeedback> : null}<p className="pp-context"><strong><bdi>{personLabel ?? teacherId}</bdi></strong><br/>{t.assignmentSeparate}</p>
    <Field required label={t.academicYear} htmlFor="assignment-year" error={text(form.formState.errors.academicYearId?.message)}><select id="assignment-year" className={selectClassName} {...form.register('academicYearId')}><option value="">{t.selectYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} — {text(year.status)}</option>)}</select></Field>
    <Field required label={t.className} htmlFor="assignment-class" error={text(form.formState.errors.classId?.message)} hint={classes.data?.length === 0 ? t.noClasses : undefined}><select id="assignment-class" className={selectClassName} disabled={!yearId || classes.isPending || classes.isError} {...form.register('classId')}><option value="">{t.selectClass}</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field required label={t.subject} htmlFor="assignment-subject" error={text(form.formState.errors.subjectId?.message)} hint={eligibleSubjects.length === 0 ? t.noSubjects : undefined}><select id="assignment-subject" className={selectClassName} {...form.register('subjectId')}><option value="">{t.selectSubject}</option>{eligibleSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></Field>
    <Field required label={t.effectiveFrom} htmlFor="assignment-from" error={text(form.formState.errors.effectiveFrom?.message)}><input id="assignment-from" type="date" dir="ltr" className={inputClassName} {...form.register('effectiveFrom')} /></Field>
    {classes.isError ? <InlineFeedback brand kind="error">{t.noClasses}</InlineFeedback> : null}<FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.create} />
  </form>;
}

export function EndAssignmentForm({ assignment, onCancel, onSaved, contextLabel }: { contextLabel?: string; assignment: TeacherAssignmentDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const t = useTeacherCopy();
  const text = usePeopleText();

  const form = useForm<EndAssignmentFormValues>({ resolver: zodResolver(endAssignmentFormSchema), defaultValues: { effectiveUntil: '' } }); const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: teachersApi.endAssignment.bind(null, assignment.id), onSuccess: async () => { setError(undefined); await onSaved(); }, onError: (value) => { if (!mapTeacherValidation(value, form.setError)) setError(text(teacherErrorMessage(value))); } });
  return <form className="pp-workspace pp-form space-y-4" noValidate onSubmit={form.handleSubmit((values) => { if (values.effectiveUntil < assignment.effectiveFrom) { form.setError('effectiveUntil', { message: t.endDateBefore }); return; } mutation.mutate(values); })}>
    {error ? <InlineFeedback brand kind="error">{error}</InlineFeedback> : null}{contextLabel ? <p className="pp-context"><bdi>{contextLabel}</bdi></p> : null}<p className="text-sm text-muted-foreground">{t.endDescription}</p><p className="text-sm text-muted-foreground">{t.reassignmentSeparate}</p>
    <Field required label={t.effectiveUntil} htmlFor="assignment-until" error={text(form.formState.errors.effectiveUntil?.message)}><input id="assignment-until" type="date" dir="ltr" min={assignment.effectiveFrom} className={inputClassName} {...form.register('effectiveUntil')} /></Field>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t.confirmEnd} />
  </form>;
}
