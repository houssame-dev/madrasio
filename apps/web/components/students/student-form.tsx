'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { studentsApi } from '@/lib/frontend/students/api';
import { mapStudentValidation, studentErrorMessage } from '@/lib/frontend/students/errors';
import { studentFormSchema, type StudentFormValues } from '@/lib/frontend/students/schemas';
import type { StudentDto } from '@/lib/frontend/students/types';

export function StudentForm({ initial, onCancel, onSaved }: { initial?: StudentDto; onCancel: () => void; onSaved: (student: StudentDto) => Promise<void> | void }) {
  const [error, setError] = useState<string>();
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: { firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', studentCode: initial?.studentCode ?? '' },
  });
  const mutation = useMutation({
    mutationFn: (values: StudentFormValues) => {
      const input = { firstName: values.firstName, lastName: values.lastName, studentCode: values.studentCode?.trim() || null };
      return initial ? studentsApi.patch(initial.id, input) : studentsApi.create(input);
    },
    onSuccess: async (student) => { setError(undefined); await onSaved(student); },
    onError: (value) => { if (!mapStudentValidation(value, form.setError)) setError(studentErrorMessage(value)); },
  });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
    {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.firstName} htmlFor="student-first-name" error={form.formState.errors.firstName?.message}><input id="student-first-name" className={inputClassName} aria-invalid={!!form.formState.errors.firstName} {...form.register('firstName')} /></Field>
      <Field label={t.lastName} htmlFor="student-last-name" error={form.formState.errors.lastName?.message}><input id="student-last-name" className={inputClassName} aria-invalid={!!form.formState.errors.lastName} {...form.register('lastName')} /></Field>
    </div>
    <Field label={`${t.studentCode} (${t.optional})`} htmlFor="student-code" error={form.formState.errors.studentCode?.message}><input id="student-code" className={inputClassName} aria-invalid={!!form.formState.errors.studentCode} {...form.register('studentCode')} /></Field>
    <p className="text-sm text-muted-foreground">{t.noLogin}</p>
    <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={initial ? t.save : t.create} />
  </form>;
}
