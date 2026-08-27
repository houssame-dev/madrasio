'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/academic/ui';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';
import { invalidateHomeworkSubmission } from '@/lib/frontend/homework/mutations';

export function SubmissionReviewDialog({ schoolId, homeworkId, submissionId, action, onClose }: { schoolId: string; homeworkId: string; submissionId: string; action: 'REVIEWED' | 'RETURNED'; onClose: () => void }) {
  const queryClient = useQueryClient(); const mutation = useMutation({ mutationFn: () => homeworkApi.review(submissionId, action), onSuccess: async () => { await invalidateHomeworkSubmission(queryClient, schoolId, homeworkId, submissionId); onClose(); } });
  return <ConfirmDialog open title={action === 'REVIEWED' ? t.review : t.return} description={action === 'REVIEWED' ? t.reviewDescription : t.returnedHint} pending={mutation.isPending} error={mutation.isError ? homeworkErrorMessage(mutation.error) : undefined} onClose={onClose} onConfirm={() => mutation.mutate()} />;
}
