'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog } from '@/components/academic/ui';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage } from '@/lib/frontend/grades/errors';
import type { GradebookDto, GradebookStatus } from '@/lib/frontend/grades/types';

interface Transition { status: GradebookStatus; label: string }
export function gradebookTransitions(status: GradebookStatus): Transition[] {
  if (status === 'DRAFT') return [{ status: 'OPEN', label: t.open }];
  if (status === 'OPEN') return [{ status: 'CLOSED', label: t.close }];
  if (status === 'CLOSED') return [{ status: 'ARCHIVED', label: t.archive }];
  return [];
}

export function GradebookLifecycleActions({ gradebook, onSaved }: { gradebook: GradebookDto; onSaved: (value: GradebookDto) => Promise<void> | void }) {
  const [selected, setSelected] = useState<Transition>();
  const mutation = useMutation({ mutationFn: (transition: Transition) => gradesApi.patchGradebook(gradebook.id, { status: transition.status }), onSuccess: async (value) => { setSelected(undefined); await onSaved(value); } });
  return <div className="flex flex-wrap gap-2">{gradebookTransitions(gradebook.status).map((transition) => <Button key={transition.status} type="button" variant="outline" onClick={() => setSelected(transition)}>{transition.label}</Button>)}<ConfirmDialog open={!!selected} title={selected ? t.lifecycleTitle(selected.label) : ''} description={selected ? t.lifecycleDescription(selected.status) : ''} pending={mutation.isPending} error={mutation.isError ? gradeErrorMessage(mutation.error) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} /></div>;
}
