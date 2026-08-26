'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';
import { mapTeacherValidation, teacherErrorMessage } from '@/lib/frontend/teachers/errors';
import { teacherFormSchema, type TeacherFormValues } from '@/lib/frontend/teachers/schemas';
import type { TeacherDto } from '@/lib/frontend/teachers/types';

export function TeacherForm({ initial, onCancel, onSaved }: { initial?: TeacherDto; onCancel: () => void; onSaved: (teacher: TeacherDto) => Promise<void> | void }) {
  const [error, setError] = useState<string>();
  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: { firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', teacherCode: initial?.teacherCode ?? '', userId: initial?.userId ?? '' },
  });
  const mutation = useMutation({
    mutationFn: (values: TeacherFormValues) => {
      const input = { firstName: values.firstName, lastName: values.lastName, teacherCode: values.teacherCode?.trim() || null, userId: values.userId || null };
      return initial ? teachersApi.patch(initial.id, input) : teachersApi.create(input);
    },
    onSuccess: async (teacher) => { setError(undefined); await onSaved(teacher); },
    onError: (value) => { if (!mapTeacherValidation(value, form.setError)) setError(teacherErrorMessage(value)); },
  });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.firstName} htmlFor="teacher-first-name" error={form.formState.errors.firstName?.message}><input id="teacher-first-name" className={inputClassName} aria-invalid={!!form.formState.errors.firstName} {...form.register('firstName')} /></Field>
      <Field label={t.lastName} htmlFor="teacher-last-name" error={form.formState.errors.lastName?.message}><input id="teacher-last-name" className={inputClassName} aria-invalid={!!form.formState.errors.lastName} {...form.register('lastName')} /></Field>
    </div>
    <Field label={`${t.teacherCode} (${t.optional})`} htmlFor="teacher-code" error={form.formState.errors.teacherCode?.message}><input id="teacher-code" className={inputClassName} aria-invalid={!!form.formState.errors.teacherCode} {...form.register('teacherCode')} /></Field>
    <Field label={`${t.userId} (${t.optional})`} htmlFor="teacher-user-id" error={form.formState.errors.userId?.message} hint={t.linkedLookupUnavailable}><input id="teacher-user-id" className={inputClassName} aria-invalid={!!form.formState.errors.userId} {...form.register('userId')} /></Field>
    <p className="text-sm text-muted-foreground">{t.linkedHint}</p>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} />
  </form>;
}
