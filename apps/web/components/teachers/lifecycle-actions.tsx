'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog } from '@/components/academic/ui';
import { teachersApi } from '@/lib/frontend/teachers/api';
import { teacherCopy as t } from '@/lib/frontend/teachers/copy';
import { teacherErrorMessage } from '@/lib/frontend/teachers/errors';
import type { TeacherDto, TeacherStatus } from '@/lib/frontend/teachers/types';

interface Transition { status: TeacherStatus; label: string }

export function teacherTransitions(status: TeacherStatus): Transition[] {
  if (status === 'ACTIVE') return [{ status: 'INACTIVE', label: t.deactivate }];
  if (status === 'INACTIVE') return [{ status: 'ACTIVE', label: t.activate }, { status: 'ARCHIVED', label: t.archive }];
  return [];
}

export function TeacherLifecycleActions({ teacher, onSaved }: { teacher: TeacherDto; onSaved: (teacher: TeacherDto) => Promise<void> | void }) {
  const [selected, setSelected] = useState<Transition>();
  const mutation = useMutation({ mutationFn: (transition: Transition) => teachersApi.patch(teacher.id, { status: transition.status }), onSuccess: async (value) => { setSelected(undefined); await onSaved(value); } });
  return <div className="flex flex-wrap gap-2">
    {teacherTransitions(teacher.status).map((transition) => transition.status === 'ACTIVE'
      ? <Button key={transition.status} type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(transition)}>{transition.label}</Button>
      : <Button key={transition.status} type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => setSelected(transition)}>{transition.label}</Button>)}
    {mutation.isError && !selected ? <p className="w-full text-sm text-destructive" role="alert">{teacherErrorMessage(mutation.error)}</p> : null}
    <ConfirmDialog open={selected != null} title={selected ? t.lifecycleTitle(selected.label, `${teacher.firstName} ${teacher.lastName}`) : ''} description={selected ? t.lifecycleDescription(selected.status, `${teacher.firstName} ${teacher.lastName}`) : ''} pending={mutation.isPending} error={mutation.isError ? teacherErrorMessage(mutation.error) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} />
  </div>;
}
