import { ConflictError } from '@/lib/errors';

export interface ReductionEvent {
  id: string; kind: string; beforeCents: number; afterCents: number;
  reductionId: string | null; replacesEventId: string | null;
  reductionBeforeCents: number | null; reductionAfterCents: number | null;
}
/** Follow explicit revisions, never transaction timestamps (which can precede a lock wait). */
export function effectiveReductions(events: readonly ReductionEvent[]) {
  const corrections = events.filter(e => e.kind === 'REDUCTION_EDIT' || e.kind === 'REDUCTION_CANCEL');
  const children = new Map<string, ReductionEvent>();
  for (const event of corrections) {
    if (!event.replacesEventId || children.has(event.replacesEventId)) throw new ConflictError('Reduction history is inconsistent.');
    children.set(event.replacesEventId, event);
  }
  const visited = new Set<string>();
  const result = events.filter(e => e.kind === 'REDUCTION').map(root => {
    let current = root, amountCents = root.beforeCents - root.afterCents;
    if (amountCents <= 0) throw new ConflictError('Reduction history is inconsistent.');
    const originalAmountCents = amountCents;
    while (children.has(current.id)) {
      const next = children.get(current.id)!;
      if (visited.has(next.id) || next.reductionId !== root.id || amountCents <= 0 || next.reductionBeforeCents !== amountCents || next.reductionAfterCents === null || next.reductionAfterCents < 0) throw new ConflictError('Reduction history is inconsistent.');
      visited.add(next.id); amountCents = next.reductionAfterCents; current = next;
    }
    return { id: root.id, currentEventId: current.id, originalAmountCents, amountCents };
  });
  if (visited.size !== corrections.length) throw new ConflictError('Reduction history is inconsistent.');
  return result;
}
