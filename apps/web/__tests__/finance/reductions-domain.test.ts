import { expect, it } from 'vitest';
import { effectiveReductions, type ReductionEvent } from '@/lib/modules/finance/domain/reductions';
const root: ReductionEvent = { id: 'root', kind: 'REDUCTION', beforeCents: 10000, afterCents: 8000, reductionId: null, replacesEventId: null, reductionBeforeCents: null, reductionAfterCents: null };
const edit: ReductionEvent = { id: 'edit', kind: 'REDUCTION_EDIT', beforeCents: 8000, afterCents: 8500, reductionId: 'root', replacesEventId: 'root', reductionBeforeCents: 2000, reductionAfterCents: 1500 };
const undo: ReductionEvent = { id: 'undo', kind: 'REDUCTION_CANCEL', beforeCents: 8500, afterCents: 10000, reductionId: 'root', replacesEventId: 'edit', reductionBeforeCents: 1500, reductionAfterCents: 0 };
it('resolves explicit revisions regardless of timestamp/display order', () => {
  expect(effectiveReductions([undo, root, edit])).toEqual([{ id: 'root', currentEventId: 'undo', originalAmountCents: 2000, amountCents: 0 }]);
  expect(effectiveReductions([edit, root, { ...root, id: 'second', beforeCents: 8000, afterCents: 7000 }]).map(r => r.amountCents)).toEqual([1500, 1000]);
});
it('fails closed for forks, missing roots, wrong root links and inconsistent correction amounts', () => {
  for (const events of [[edit], [root, edit, { ...edit, id: 'fork' }], [root, { ...edit, reductionId: 'foreign' }], [root, { ...edit, reductionBeforeCents: 1000 }], [root, edit, undo, { ...edit, id: 'revive', replacesEventId: 'undo', reductionBeforeCents: 0 }]]) expect(() => effectiveReductions(events)).toThrow();
});
