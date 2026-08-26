'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog } from '@/components/academic/ui';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage } from '@/lib/frontend/grades/errors';
import type { AssessmentDto, AssessmentStatus } from '@/lib/frontend/grades/types';

interface Transition { status: AssessmentStatus; label: string; title: string; description: string }
export function assessmentTransitions(status: AssessmentStatus): Transition[] {
  if (status === 'DRAFT') return [
    { status: 'PUBLISHED', label: t.publish, title: t.publishTitle, description: t.publishDescription },
    { status: 'ARCHIVED', label: t.archiveAssessment, title: t.archiveAssessmentTitle, description: t.archiveAssessmentDescription },
  ];
  if (status === 'PUBLISHED') return [{ status: 'ARCHIVED', label: t.archiveAssessment, title: t.archiveAssessmentTitle, description: t.archiveAssessmentDescription }];
  return [];
}

export function AssessmentLifecycleActions({ assessment, onSaved }: { assessment: AssessmentDto; onSaved: (value: AssessmentDto) => Promise<void> | void }) {
  const [selected, setSelected] = useState<Transition>();
  const mutation = useMutation({ mutationFn: (transition: Transition) => gradesApi.patchAssessment(assessment.id, { status: transition.status }), onSuccess: async (value) => { setSelected(undefined); await onSaved(value); } });
  return <div className="flex flex-wrap justify-end gap-2">{assessmentTransitions(assessment.status).map((transition) => <Button key={transition.status} type="button" variant="outline" size="sm" onClick={() => setSelected(transition)}>{transition.label}</Button>)}<ConfirmDialog open={!!selected} title={selected?.title ?? ''} description={selected?.description ?? ''} pending={mutation.isPending} error={mutation.isError ? gradeErrorMessage(mutation.error) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} /></div>;
}
