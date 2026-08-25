'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';

import { academicCopy as t } from '@/lib/frontend/academic/copy';
import { academicErrorMessage, mapValidationErrors } from '@/lib/frontend/academic/errors';
import { mutateResource } from '@/lib/frontend/academic/api';
import {
  classFormSchema, curriculumFormSchema, curriculumSubjectFormSchema, levelFormSchema,
  orderedFormSchema, periodFormSchema, subjectFormSchema, versionFormSchema, yearFormSchema,
  type ClassFormValues, type CurriculumFormValues, type CurriculumSubjectFormValues,
  type LevelFormValues, type OrderedFormValues, type PeriodFormValues, type SubjectFormValues,
  type VersionFormValues, type YearFormValues,
} from '@/lib/frontend/academic/schemas';
import type {
  AcademicPeriodDto, AcademicYearDto, ClassDto, CurriculumDto, CurriculumSubjectDto,
  CurriculumVersionDto, LevelDto, OrderedStructureDto, SubjectDto,
} from '@/lib/frontend/academic/types';
import type { VersionOption } from '@/lib/frontend/academic/api';
import { Field, FormActions, InlineFeedback, inputClassName, selectClassName } from './ui';

function useSave<TValues extends FieldValues, TResult>(options: {
  setError: UseFormSetError<TValues>;
  mutationFn: (values: TValues) => Promise<TResult>;
  onSuccess: (result: TResult) => Promise<void> | void;
}) {
  const [formError, setFormError] = useState<string>();
  const mutation = useMutation({
    mutationFn: options.mutationFn,
    async onSuccess(result) { setFormError(undefined); await options.onSuccess(result); },
    onError(error) {
      if (!mapValidationErrors(error, options.setError)) setFormError(academicErrorMessage(error));
    },
  });
  return { mutation, formError };
}

const errorText = (error: { message?: string } | undefined) => error?.message;

export function YearForm({ initial, onCancel, onSaved }: { initial?: AcademicYearDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<YearFormValues>({ resolver: zodResolver(yearFormSchema), defaultValues: initial ? { name: initial.name, startDate: initial.startDate, endDate: initial.endDate } : { name: '', startDate: '', endDate: '' } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<AcademicYearDto>(initial ? `/api/v1/academic-years/${initial.id}` : '/api/v1/academic-years', initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  const datesReadOnly = initial != null && initial.status !== 'PLANNED';
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>
    {save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}
    <Field label={t.name} htmlFor="year-name" error={errorText(form.formState.errors.name)}><input id="year-name" className={inputClassName} aria-invalid={!!form.formState.errors.name} {...form.register('name')} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.startDate} htmlFor="year-start" error={errorText(form.formState.errors.startDate)}><input id="year-start" type="date" readOnly={datesReadOnly} className={inputClassName} {...form.register('startDate')} /></Field>
      <Field label={t.endDate} htmlFor="year-end" error={errorText(form.formState.errors.endDate)}><input id="year-end" type="date" readOnly={datesReadOnly} className={inputClassName} {...form.register('endDate')} /></Field>
    </div>
    {datesReadOnly ? <p className="text-sm text-muted-foreground">{t.dateReadOnly}</p> : initial ? <p className="text-sm text-muted-foreground">{t.plannedDependency}</p> : null}
    <FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} />
  </form>;
}

export function PeriodForm({ year, initial, onCancel, onSaved }: { year: AcademicYearDto; initial?: AcademicPeriodDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<PeriodFormValues>({ resolver: zodResolver(periodFormSchema), defaultValues: initial ? { name: initial.name, sequence: initial.sequence, startDate: initial.startDate, endDate: initial.endDate } : { name: '', sequence: 0, startDate: year.startDate, endDate: year.endDate } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<AcademicPeriodDto>(initial ? `/api/v1/academic-periods/${initial.id}` : `/api/v1/academic-years/${year.id}/periods`, initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  const datesReadOnly = initial != null && initial.status !== 'PLANNED';
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => {
    if (values.startDate < year.startDate || values.endDate > year.endDate) {
      form.setError('endDate', { message: t.periodBoundary(year.startDate, year.endDate) });
      return;
    }
    save.mutation.mutate(values);
  })} noValidate>
    {save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]"><Field label={t.name} htmlFor="period-name" error={errorText(form.formState.errors.name)}><input id="period-name" className={inputClassName} {...form.register('name')} /></Field><Field label={t.sequence} htmlFor="period-sequence" error={errorText(form.formState.errors.sequence)}><input id="period-sequence" type="number" min="0" className={inputClassName} {...form.register('sequence', { valueAsNumber: true })} /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={t.startDate} htmlFor="period-start" error={errorText(form.formState.errors.startDate)}><input id="period-start" type="date" min={year.startDate} max={year.endDate} readOnly={datesReadOnly} className={inputClassName} {...form.register('startDate')} /></Field><Field label={t.endDate} htmlFor="period-end" error={errorText(form.formState.errors.endDate)}><input id="period-end" type="date" min={year.startDate} max={year.endDate} readOnly={datesReadOnly} className={inputClassName} {...form.register('endDate')} /></Field></div>
    {datesReadOnly ? <p className="text-sm text-muted-foreground">{t.dateReadOnly}</p> : initial ? <p className="text-sm text-muted-foreground">{t.plannedDependency}</p> : null}
    <FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} />
  </form>;
}

export function OrderedStructureForm({ resource, initial, onCancel, onSaved }: { resource: 'stages' | 'tracks'; initial?: OrderedStructureDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<OrderedFormValues>({ resolver: zodResolver(orderedFormSchema), defaultValues: initial ? { name: initial.name, sequence: initial.sequence } : { name: '', sequence: 0 } });
  const singular = resource === 'stages' ? 'stages' : 'tracks';
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<OrderedStructureDto>(initial ? `/api/v1/${singular}/${initial.id}` : `/api/v1/${singular}`, initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.name} htmlFor={`${resource}-name`} error={errorText(form.formState.errors.name)}><input id={`${resource}-name`} className={inputClassName} {...form.register('name')} /></Field><Field label={t.sequence} htmlFor={`${resource}-sequence`} error={errorText(form.formState.errors.sequence)}><input id={`${resource}-sequence`} type="number" min="0" className={inputClassName} {...form.register('sequence', { valueAsNumber: true })} /></Field><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function LevelForm({ stages, initial, onCancel, onSaved }: { stages: OrderedStructureDto[]; initial?: LevelDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<LevelFormValues>({ resolver: zodResolver(levelFormSchema), defaultValues: initial ? { name: initial.name, sequence: initial.sequence, stageId: initial.stageId } : { name: '', sequence: 0, stageId: stages[0]?.id ?? '' } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<LevelDto>(initial ? `/api/v1/levels/${initial.id}` : '/api/v1/levels', initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.stage} htmlFor="level-stage" error={errorText(form.formState.errors.stageId)}><select id="level-stage" className={selectClassName} {...form.register('stageId')}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field><Field label={t.name} htmlFor="level-name" error={errorText(form.formState.errors.name)}><input id="level-name" className={inputClassName} {...form.register('name')} /></Field><Field label={t.sequence} htmlFor="level-sequence" error={errorText(form.formState.errors.sequence)}><input id="level-sequence" type="number" min="0" className={inputClassName} {...form.register('sequence', { valueAsNumber: true })} /></Field><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function SubjectForm({ initial, onCancel, onSaved }: { initial?: SubjectDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<SubjectFormValues>({ resolver: zodResolver(subjectFormSchema), defaultValues: { name: initial?.name ?? '', code: initial?.code ?? '' } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<SubjectDto>(initial ? `/api/v1/subjects/${initial.id}` : '/api/v1/subjects', initial ? 'PATCH' : 'POST', { name: values.name, code: values.code?.trim() || null }), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.name} htmlFor="subject-name" error={errorText(form.formState.errors.name)}><input id="subject-name" className={inputClassName} {...form.register('name')} /></Field><Field label={`${t.code} (${t.optional})`} htmlFor="subject-code" error={errorText(form.formState.errors.code)}><input id="subject-code" className={inputClassName} {...form.register('code')} /></Field><p className="text-sm text-muted-foreground">{t.noCoefficientOnSubject}</p><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function CurriculumForm({ initial, onCancel, onSaved }: { initial?: CurriculumDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<CurriculumFormValues>({ resolver: zodResolver(curriculumFormSchema), defaultValues: { name: initial?.name ?? '' } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<CurriculumDto>(initial ? `/api/v1/curricula/${initial.id}` : '/api/v1/curricula', initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.name} htmlFor="curriculum-name" error={errorText(form.formState.errors.name)}><input id="curriculum-name" readOnly={initial?.status === 'ARCHIVED'} className={inputClassName} {...form.register('name')} /></Field><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function VersionForm({ curriculumId, initial, onCancel, onSaved }: { curriculumId: string; initial?: CurriculumVersionDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<VersionFormValues>({ resolver: zodResolver(versionFormSchema), defaultValues: { name: initial?.name ?? '' } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<CurriculumVersionDto>(initial ? `/api/v1/curriculum-versions/${initial.id}` : `/api/v1/curricula/${curriculumId}/versions`, initial ? 'PATCH' : 'POST', values), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.name} htmlFor="version-name" error={errorText(form.formState.errors.name)}><input id="version-name" readOnly={initial != null && initial.status !== 'DRAFT'} className={inputClassName} {...form.register('name')} /></Field>{initial && initial.status !== 'DRAFT' ? <p className="text-sm text-muted-foreground">{t.draftOnly}</p> : null}<FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function CurriculumSubjectForm({ version, subjects, attachedSubjectIds, initial, onCancel, onSaved }: { version: CurriculumVersionDto; subjects: SubjectDto[]; attachedSubjectIds: Set<string>; initial?: CurriculumSubjectDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const available = subjects.filter((subject) => subject.status === 'ACTIVE' && (!attachedSubjectIds.has(subject.id) || subject.id === initial?.subjectId));
  const form = useForm<CurriculumSubjectFormValues>({ resolver: zodResolver(curriculumSubjectFormSchema), defaultValues: { subjectId: initial?.subjectId ?? available[0]?.id ?? '', coefficient: initial?.coefficient ?? '', displayOrder: initial?.displayOrder ?? undefined } });
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<CurriculumSubjectDto>(initial ? `/api/v1/curriculum-subjects/${initial.id}` : `/api/v1/curriculum-versions/${version.id}/subjects`, initial ? 'PATCH' : 'POST', initial ? { coefficient: values.coefficient, displayOrder: values.displayOrder ?? null } : { ...values, displayOrder: values.displayOrder ?? null }), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.subject} htmlFor="curriculum-subject" error={errorText(form.formState.errors.subjectId)}>{initial ? <><input type="hidden" {...form.register('subjectId')} /><p className="rounded-md border bg-muted px-3 py-2 text-sm">{initial.subjectName}</p></> : <select id="curriculum-subject" className={selectClassName} {...form.register('subjectId')}>{available.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select>}</Field><div className="grid gap-4 sm:grid-cols-2"><Field label={t.coefficient} htmlFor="coefficient" error={errorText(form.formState.errors.coefficient)}><input id="coefficient" type="number" min="0.01" max="99.99" step="0.01" className={inputClassName} {...form.register('coefficient')} /></Field><Field label={`${t.displayOrder} (${t.optional})`} htmlFor="display-order" error={errorText(form.formState.errors.displayOrder)}><input id="display-order" type="number" min="0" className={inputClassName} {...form.register('displayOrder', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field></div><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}

export function ClassForm({ years, levels, tracks, versions, initial, onCancel, onSaved }: { years: AcademicYearDto[]; levels: LevelDto[]; tracks: OrderedStructureDto[]; versions: VersionOption[]; initial?: ClassDto; onCancel: () => void; onSaved: () => Promise<void> | void }) {
  const form = useForm<ClassFormValues>({ resolver: zodResolver(classFormSchema), defaultValues: { name: initial?.name ?? '', academicYearId: initial?.academicYearId ?? years[0]?.id ?? '', levelId: initial?.levelId ?? levels[0]?.id ?? '', trackId: initial?.trackId ?? null, curriculumVersionId: initial?.curriculumVersionId ?? versions[0]?.id ?? '' } });
  const year = years.find((item) => item.id === initial?.academicYearId);
  const save = useSave({ setError: form.setError, mutationFn: (values) => mutateResource<ClassDto>(initial ? `/api/v1/classes/${initial.id}` : '/api/v1/classes', initial ? 'PATCH' : 'POST', initial ? { name: values.name, levelId: values.levelId, trackId: values.trackId || null, curriculumVersionId: values.curriculumVersionId } : { ...values, trackId: values.trackId || null }), onSuccess: onSaved });
  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutation.mutate(values))} noValidate>{save.formError ? <InlineFeedback kind="error">{save.formError}</InlineFeedback> : null}<Field label={t.name} htmlFor="class-name" error={errorText(form.formState.errors.name)}><input id="class-name" className={inputClassName} {...form.register('name')} /></Field><Field label={t.academicYear} htmlFor="class-year" error={errorText(form.formState.errors.academicYearId)}>{initial ? <><input type="hidden" {...form.register('academicYearId')} /><p id="class-year" className="rounded-md border bg-muted px-3 py-2 text-sm">{year?.name ?? initial.academicYearId}</p><p className="text-xs text-muted-foreground">{t.yearImmutable}</p></> : <select id="class-year" className={selectClassName} {...form.register('academicYearId')}>{years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</Field><div className="grid gap-4 sm:grid-cols-2"><Field label={t.level} htmlFor="class-level" error={errorText(form.formState.errors.levelId)}><select id="class-level" className={selectClassName} {...form.register('levelId')}>{levels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label={`${t.track} (${t.optional})`} htmlFor="class-track" error={errorText(form.formState.errors.trackId)}><select id="class-track" className={selectClassName} {...form.register('trackId', { setValueAs: (value) => value || null })}><option value="">{t.noTrack}</option>{tracks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Field label={t.curriculumVersion} htmlFor="class-version" error={errorText(form.formState.errors.curriculumVersionId)}><select id="class-version" className={selectClassName} {...form.register('curriculumVersionId')}>{versions.map((item) => <option key={item.id} value={item.id}>{item.curriculumName} — {item.name}</option>)}</select></Field><FormActions pending={save.mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} /></form>;
}
