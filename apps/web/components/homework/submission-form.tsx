'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage, mapHomeworkValidation } from '@/lib/frontend/homework/errors';
import { invalidateHomeworkSubmission } from '@/lib/frontend/homework/mutations';
import { submissionFormSchema, type SubmissionFormValues } from '@/lib/frontend/homework/schemas';

export function SubmissionForm({ schoolId, homeworkId, studentId, submissionId, initialContent = '', onCancel, onSaved }: { schoolId: string; homeworkId: string; studentId: string; submissionId?: string; initialContent?: string; onCancel: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient(); const [error, setError] = useState<string>(); const form = useForm<SubmissionFormValues>({ resolver: zodResolver(submissionFormSchema), defaultValues: { content: initialContent } });
  const mutation = useMutation({ mutationFn: (values: SubmissionFormValues) => submissionId ? homeworkApi.resubmit(submissionId, values.content.trim() || null) : homeworkApi.createSubmission(homeworkId, { studentId, content: values.content.trim() || null }), onSuccess: async (value) => { await invalidateHomeworkSubmission(queryClient, schoolId, homeworkId, value.id); onSaved(); }, onError: (value) => { if (!mapHomeworkValidation(value, form.setError)) setError(homeworkErrorMessage(value)); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>{error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<Field label={t.content} htmlFor={`submission-content-${studentId}`} error={form.formState.errors.content?.message} hint={`${t.plainText} ${t.lateOwned}`}><textarea id={`submission-content-${studentId}`} className={`${inputClassName} min-h-40 py-2`} {...form.register('content')} /></Field><FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={submissionId ? t.resubmit : t.createSubmission} /></form>;
}

