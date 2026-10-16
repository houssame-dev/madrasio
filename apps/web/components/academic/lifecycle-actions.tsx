'use client';

import { useMutation } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useState } from 'react';
import { Button } from '@school/ui';
import { mutateResource } from '@/lib/frontend/academic/api';
import { useAcademicCopy } from '@/i18n/use-domain-copy';
import { academicErrorMessage } from '@/lib/frontend/academic/errors';
import { ConfirmDialog } from './ui';

export interface LifecycleTransition { label: string; status: string; confirm?: boolean }

export function LifecycleActions({ resourceName, path, transitions, onSaved }: { resourceName: string; path: `/api/v1/${string}`; transitions: readonly LifecycleTransition[]; onSaved: () => Promise<void> | void }) {
  const text = useDomainText();
  const t = useAcademicCopy();
  const [selected, setSelected] = useState<LifecycleTransition>();
  const mutation = useMutation({ mutationFn: (transition: LifecycleTransition) => mutateResource(path, 'PATCH', { status: transition.status }), onSuccess: async () => { setSelected(undefined); await onSaved(); } });
  const run = (transition: LifecycleTransition) => transition.confirm ? setSelected(transition) : mutation.mutate(transition);
  return <div className="flex flex-wrap justify-end gap-1">{transitions.map((transition) => <Button key={transition.status} type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => run(transition)}>{text(transition.label)}</Button>)}{mutation.isError && !selected ? <span className="w-full text-xs text-destructive" role="alert">{text(academicErrorMessage(mutation.error))}</span> : null}<ConfirmDialog open={selected != null} title={selected ? t.transitionTitle(text(selected.label), resourceName) : t.confirm} description={selected ? t.transitionDescription(text(selected.status), resourceName) : ''} pending={mutation.isPending} error={mutation.isError ? text(academicErrorMessage(mutation.error)) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} /></div>;
}

export const yearTransitions = (status: string): LifecycleTransition[] => status === 'PLANNED' ? [{ label: 'Activate', status: 'ACTIVE', confirm: true }] : status === 'ACTIVE' ? [{ label: 'Close', status: 'CLOSED', confirm: true }] : status === 'CLOSED' ? [{ label: 'Archive', status: 'ARCHIVED', confirm: true }] : [];
export const periodTransitions = (status: string): LifecycleTransition[] => status === 'PLANNED' ? [{ label: 'Activate', status: 'ACTIVE', confirm: true }] : status === 'ACTIVE' ? [{ label: 'Close', status: 'CLOSED', confirm: true }] : [];
export const activeTransitions = (status: string): LifecycleTransition[] => status === 'ACTIVE' ? [{ label: 'Deactivate', status: 'INACTIVE' }] : [{ label: 'Activate', status: 'ACTIVE', confirm: true }];
export const curriculumTransitions = (status: string): LifecycleTransition[] => status === 'ACTIVE' ? [{ label: 'Deactivate', status: 'INACTIVE' }, { label: 'Archive', status: 'ARCHIVED', confirm: true }] : status === 'INACTIVE' ? [{ label: 'Activate', status: 'ACTIVE', confirm: true }, { label: 'Archive', status: 'ARCHIVED', confirm: true }] : [];
export const versionTransitions = (status: string): LifecycleTransition[] => status === 'DRAFT' ? [{ label: 'Activate', status: 'ACTIVE', confirm: true }, { label: 'Archive', status: 'ARCHIVED', confirm: true }] : status === 'ACTIVE' ? [{ label: 'Archive', status: 'ARCHIVED', confirm: true }] : [];
export const classTransitions = (status: string): LifecycleTransition[] => status === 'ACTIVE' ? [{ label: 'Close', status: 'CLOSED', confirm: true }] : status === 'CLOSED' ? [{ label: 'Archive', status: 'ARCHIVED', confirm: true }] : [];
