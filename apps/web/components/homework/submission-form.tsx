'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useDomainText } from '@/i18n/use-domain-text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { schoolWallTimeToInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { useHomeworkCopy } from '@/i18n/use-domain-copy';
import { homeworkErrorMessage, mapHomeworkValidation } from '@/lib/frontend/homework/errors';
import { invalidateHomeworkSubmission } from '@/lib/frontend/homework/mutations';
import { submissionFormSchema, type SubmissionFormValues } from '@/lib/frontend/homework/schemas';

export function SubmissionForm({ schoolId, homeworkId, studentId, submissionId, initialContent = '', onCancel, onSaved }: { schoolId: string; homeworkId: string; studentId: string; submissionId?: string; initialContent?: string; onCancel: () => void; onSaved: () => void }) {
  const learning = useTranslations('learningUi');
  const text = useDomainText();
  const ui = useTranslations('domainUi');
  const t = useHomeworkCopy();
  const app = useAppContext();
  const queryClient = useQueryClient(); const [error, setError] = useState<string>(); const form = useForm<SubmissionFormValues>({ resolver: zodResolver(submissionFormSchema), defaultValues: { content: initialContent, actualHandedInAt: '' } });
  const mutation = useMutation({ mutationFn: (values: SubmissionFormValues) => submissionId ? homeworkApi.resubmit(submissionId, values.content.trim() || null, values.actualHandedInAt || null) : homeworkApi.createSubmission(homeworkId, { studentId, content: values.content.trim() || null, actualHandedInAt: values.actualHandedInAt || null }), onSuccess: async (value) => { await invalidateHomeworkSubmission(queryClient, schoolId, homeworkId, value.id); onSaved(); }, onError: (value) => { if (!mapHomeworkValidation(value, form.setError)) setError(text(homeworkErrorMessage(value))); } });
  const submit = (values: SubmissionFormValues) => {
    let actualHandedInAt: string | null = null;
    if (values.actualHandedInAt) {
      try {
        if (!app.currentSchool?.timezone) throw new Error();
        actualHandedInAt = schoolWallTimeToInstant(values.actualHandedInAt, app.currentSchool.timezone);
      } catch {
        form.setError('actualHandedInAt', { message: text("Choose a valid, unambiguous School-local hand-in time.") });
        return;
      }
    }
    mutation.mutate({ ...values, actualHandedInAt: actualHandedInAt ?? '' });
  };
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>{form.formState.isDirty ? <InlineFeedback brand kind="warning">{learning('unsaved')}</InlineFeedback> : null}{error ? <InlineFeedback brand kind="error">{error}</InlineFeedback> : null}<Field label={t.content} htmlFor={`submission-content-${studentId}`} error={text(form.formState.errors.content?.message)} hint={`${t.plainText} ${t.lateOwned}`}><textarea id={`submission-content-${studentId}`} className={`${inputClassName} min-h-40 py-2`} {...form.register('content')} /></Field><Field label={t.actualHandedInAt} htmlFor={`submission-actual-${studentId}`} error={text(form.formState.errors.actualHandedInAt?.message)} hint={ui('handInHint', { timezone: app.currentSchool?.timezone ?? text('School timezone unavailable') })}><input id={`submission-actual-${studentId}`} type="datetime-local" dir="ltr" className={inputClassName} {...form.register('actualHandedInAt')} /></Field><FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={submissionId ? t.resubmit : t.createSubmission} /></form>;
}

