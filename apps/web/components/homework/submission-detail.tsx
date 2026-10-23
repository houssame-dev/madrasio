'use client';

import { useQuery } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback, Modal, StatusBadge } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { useHomeworkCopy } from '@/i18n/use-domain-copy';
import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import type { HomeworkDto } from '@/lib/frontend/homework/types';
import { SubmissionAttachments } from './submission-attachments';
import { SubmissionTiming } from './submission-timing';
import { SubmissionForm } from './submission-form';
import { SubmissionReviewDialog } from './submission-review-dialog';

export function SubmissionDetail({ schoolId, homework, submissionId, studentName, onClose }: { schoolId: string; homework: HomeworkDto; submissionId: string; studentName: string; onClose: () => void }) {
  const text = useDomainText();
  const t = useHomeworkCopy();
  const [action, setAction] = useState<'REVIEWED' | 'RETURNED'>(); const [resubmitting, setResubmitting] = useState(false);
  const query = useQuery({ queryKey: homeworkKeys.submission(schoolId, submissionId), queryFn: () => homeworkApi.submission(submissionId) });
  return <Modal open title={`${t.submission}: ${studentName}`} description={t.lateOwned} onClose={onClose}>{query.isPending ? <InlineLoading label={t.loading} /> : query.isError ? <ApiErrorState title={t.unavailable} description={text(homeworkErrorMessage(query.error))} onRetry={() => void query.refetch()} /> : resubmitting ? <SubmissionForm schoolId={schoolId} homeworkId={homework.id} studentId={query.data.studentId} submissionId={query.data.id} initialContent={query.data.content ?? ''} onCancel={() => setResubmitting(false)} onSaved={() => setResubmitting(false)} /> : <div className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs uppercase text-muted-foreground">{t.status}</dt><dd dir="auto">{t.delivered} · <StatusBadge brand status={query.data.status} label={text(query.data.status)} /></dd></div></dl>
    <SubmissionTiming {...query.data} />
    <SubmissionAttachments key={query.data.id} submissionId={query.data.id} editable={homework.status === 'PUBLISHED' && ['SUBMITTED', 'LATE'].includes(query.data.status)} />
    <section><h3 className="text-sm font-medium">{t.content}</h3><p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{query.data.content ?? '—'}</p></section>
    {query.data.status === 'REVIEWED' ? <InlineFeedback brand kind="success">{t.reviewed}</InlineFeedback> : null}{query.data.status === 'RETURNED' ? <InlineFeedback brand kind="error">{t.returnedHint}</InlineFeedback> : null}
    <div className="flex flex-wrap justify-end gap-2">{(query.data.status === 'SUBMITTED' || query.data.status === 'LATE') && homework.status !== 'ARCHIVED' ? <Button type="button" onClick={() => setAction('REVIEWED')}>{t.review}</Button> : null}{query.data.status === 'REVIEWED' && homework.status !== 'ARCHIVED' ? <Button type="button" onClick={() => setAction('RETURNED')}>{t.return}</Button> : null}{query.data.status === 'RETURNED' && homework.status === 'PUBLISHED' ? <Button type="button" onClick={() => setResubmitting(true)}>{t.resubmit}</Button> : null}</div>
    {action ? <SubmissionReviewDialog schoolId={schoolId} homeworkId={homework.id} submissionId={submissionId} action={action} onClose={() => setAction(undefined)} /> : null}
  </div>}</Modal>;
}

