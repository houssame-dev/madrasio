'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog } from '@/components/academic/ui';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import { studentErrorMessage } from '@/lib/frontend/students/errors';
import type { StudentDto, StudentStatus } from '@/lib/frontend/students/types';

interface Transition { status: StudentStatus; label: string; confirm: boolean }

export function studentTransitions(status: StudentStatus): Transition[] {
  if (status === 'ACTIVE') return [{ status: 'INACTIVE', label: t.deactivate, confirm: false }, { status: 'WITHDRAWN', label: t.withdraw, confirm: true }];
  if (status === 'INACTIVE') return [{ status: 'ACTIVE', label: t.activate, confirm: false }, { status: 'WITHDRAWN', label: t.withdraw, confirm: true }, { status: 'ARCHIVED', label: t.archive, confirm: true }];
  if (status === 'WITHDRAWN') return [{ status: 'ARCHIVED', label: t.archive, confirm: true }];
  return [];
}

export function StudentLifecycleActions({ student, onSaved }: { student: StudentDto; onSaved: (student: StudentDto) => Promise<void> | void }) {
  const [selected, setSelected] = useState<Transition>();
  const mutation = useMutation({ mutationFn: (transition: Transition) => studentsApi.patch(student.id, { status: transition.status }), onSuccess: async (value) => { setSelected(undefined); await onSaved(value); } });
  const run = (transition: Transition) => transition.confirm ? setSelected(transition) : mutation.mutate(transition);
  return <div className="flex flex-wrap gap-2">
    {studentTransitions(student.status).map((transition) => <Button key={transition.status} type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => run(transition)}>{transition.label}</Button>)}
    {mutation.isError && !selected ? <p className="w-full text-sm text-destructive" role="alert">{studentErrorMessage(mutation.error)}</p> : null}
    <ConfirmDialog open={selected != null} title={selected ? t.lifecycleTitle(selected.label, `${student.firstName} ${student.lastName}`) : ''} description={selected ? t.lifecycleDescription(selected.status, `${student.firstName} ${student.lastName}`) : ''} pending={mutation.isPending} error={mutation.isError ? studentErrorMessage(mutation.error) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} />
  </div>;
}
