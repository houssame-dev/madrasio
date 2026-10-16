'use client';
import { usePeopleText } from '@/i18n/use-people-text';

import { useMutation } from '@tanstack/react-query'; import { useState } from 'react'; import { Button } from '@school/ui'; import { ConfirmDialog } from '@/components/academic/ui'; import { parentsApi } from '@/lib/frontend/parents/api'; import { parentCopy as t } from '@/lib/frontend/parents/copy';
import { useParentCopy } from '@/i18n/use-people-copy'; import { parentErrorMessage } from '@/lib/frontend/parents/errors'; import type { ParentDto, ParentStatus } from '@/lib/frontend/parents/types';
interface Transition { status: ParentStatus; label: string }
export function parentTransitions(status: ParentStatus): Transition[] { if (status === 'ACTIVE') return [{ status: 'INACTIVE', label: t.deactivate }]; if (status === 'INACTIVE') return [{ status: 'ACTIVE', label: t.activate }, { status: 'ARCHIVED', label: t.archive }]; return []; }
export function ParentLifecycleActions({ parent, onSaved }: { parent: ParentDto; onSaved: (parent: ParentDto) => Promise<void> | void }) {
  const t = useParentCopy();
  const text = usePeopleText();

  const [selected, setSelected] = useState<Transition>(); const mutation = useMutation({ mutationFn: (transition: Transition) => parentsApi.patch(parent.id, { status: transition.status }), onSuccess: async (value) => { setSelected(undefined); await onSaved(value); } });
  return <div className="flex flex-wrap gap-2">{parentTransitions(parent.status).map((transition) => transition.status === 'ACTIVE' ? <Button key={transition.status} type="button" variant="outline" size="sm" onClick={() => mutation.mutate(transition)}>{text(transition.label)}</Button> : <Button key={transition.status} type="button" variant="outline" size="sm" onClick={() => setSelected(transition)}>{text(transition.label)}</Button>)}{mutation.isError && !selected ? <p role="alert" className="w-full text-sm text-destructive">{text(parentErrorMessage(mutation.error))}</p> : null}<ConfirmDialog open={selected != null} title={selected ? t.lifecycleTitle(text(selected.label), `${parent.firstName} ${parent.lastName}`) : ''} description={selected ? t.lifecycleDescription(selected.status, `${parent.firstName} ${parent.lastName}`) : ''} pending={mutation.isPending} error={mutation.isError ? text(parentErrorMessage(mutation.error)) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} /></div>;
}
