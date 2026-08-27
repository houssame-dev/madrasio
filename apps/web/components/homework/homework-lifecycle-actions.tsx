'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog } from '@/components/academic/ui';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';
import { invalidateHomework } from '@/lib/frontend/homework/mutations';
import type { HomeworkStatus } from '@/lib/frontend/homework/types';

const next: Record<HomeworkStatus, { status: HomeworkStatus; label: string; description: string } | undefined> = {
  DRAFT: { status: 'PUBLISHED', label: t.publish, description: t.publishDescription },
  PUBLISHED: { status: 'CLOSED', label: t.close, description: t.closeDescription },
  CLOSED: { status: 'ARCHIVED', label: t.archive, description: t.archiveDescription },
  ARCHIVED: undefined,
};

export function HomeworkLifecycleActions({ schoolId, homeworkId, status }: { schoolId: string; homeworkId: string; status: HomeworkStatus }) {
  const queryClient = useQueryClient(); const [confirming, setConfirming] = useState(false); const transition = next[status];
  const mutation = useMutation({ mutationFn: () => homeworkApi.patch(homeworkId, { status: transition!.status }), onSuccess: async () => { await invalidateHomework(queryClient, schoolId, homeworkId, true); setConfirming(false); } });
  if (!transition) return null;
  return <><Button type="button" onClick={() => setConfirming(true)}>{transition.label}</Button><ConfirmDialog open={confirming} title={t.lifecycleTitle(transition.label)} description={transition.description} pending={mutation.isPending} error={mutation.isError ? homeworkErrorMessage(mutation.error) : undefined} onClose={() => { setConfirming(false); mutation.reset(); }} onConfirm={() => mutation.mutate()} /></>;
}

