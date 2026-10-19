'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { Field, inputClassName } from '@/components/academic/ui';
import { effectiveReductions } from '@/lib/modules/finance/domain/reductions';
import { decimalMoney, formatMoney } from '@/lib/modules/finance/domain/csv';
import { parseMoney } from '@/lib/modules/finance/domain/contracts';
import type { chargeDetail } from '@/lib/modules/finance/application/service';

type Detail = Awaited<ReturnType<typeof chargeDetail>>;
type Write = { path: `/api/v1/${string}`; method: 'PATCH'; body: unknown };
export function ReductionHistory({ detail, timezone, busy, onWrite, onReload }: { detail: Detail; timezone: string; busy: boolean; onWrite: (input: Write) => Promise<boolean>; onReload: () => void }) {
  const t = useTranslations('finance'), locale = useLocale();
  const reductions = new Map(effectiveReductions(detail.events).map(r => [r.id, r]));
  const money = (n: number) => formatMoney(n, locale, detail.charge.currency);
  return <section aria-label={t('history')} className="space-y-3"><h3 className="font-semibold">{t('history')}</h3>
    {!detail.events.length ? <p>{t('empty')}</p> : <ol className="space-y-3">{detail.events.map(event => {
      const reduction = reductions.get(event.id);
      return <li key={event.id} id={`finance-event-${event.id}`} className="min-w-0 space-y-2 rounded-md border p-3">
        <p>{t(event.kind)} · {t('payableChange')}: <bdi>{money(event.beforeCents)} → {money(event.afterCents)}</bdi></p>
        <p dir="auto">{event.reason}</p>
        <p className="break-words text-sm">{t('eventActor')}: <bdi>{event.actorId}</bdi>{event.occurredAt ? <> · <time dateTime={new Date(event.occurredAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(event.occurredAt))}</time></> : null}</p>
        {event.reductionId ? <><p className="break-all text-sm">{t('affectedReduction')}: <a className="underline" href={`#finance-event-${event.reductionId}`}><bdi>{event.reductionId}</bdi></a></p><p>{t('reductionChange')}: <bdi>{money(event.reductionBeforeCents!)} → {money(event.reductionAfterCents!)}</bdi></p></> : null}
        {reduction ? <ReductionControls chargeId={detail.charge.id} reduction={reduction} currency={detail.charge.currency} disabled={busy || detail.charge.status !== 'OPEN'} onWrite={onWrite} onReload={onReload} /> : null}
      </li>;
    })}</ol>}
  </section>;
}

function ReductionControls({ chargeId, reduction, currency, disabled, onWrite, onReload }: { chargeId: string; reduction: ReturnType<typeof effectiveReductions>[number]; currency: string; disabled: boolean; onWrite: (input: Write) => Promise<boolean>; onReload: () => void }) {
  const t = useTranslations('finance'), locale = useLocale();
  const [mode, setMode] = useState<'REDUCTION_EDIT' | 'REDUCTION_CANCEL' | null>(null);
  const [editingVersion, setEditingVersion] = useState('');
  const [confirmed, setConfirmed] = useState(false), [invalid, setInvalid] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const request = useRef<{ signature: string; key: string } | null>(null), container = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mode || !confirmed || disabled || editingVersion !== reduction.currentEventId) return;
    const fields = new FormData(event.currentTarget);
    try {
      const payload = { expectedEventId: editingVersion, kind: mode, reason: String(fields.get('reason')), confirmed: true,
        ...(mode === 'REDUCTION_EDIT' ? { amountCents: parseMoney(String(fields.get('amount'))) } : {}) };
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
      const ok = await onWrite({ path: `/api/v1/finance/charges/${chargeId}/reductions/${reduction.id}`, method: 'PATCH', body: { ...payload, requestKey: request.current.key } });
      if (ok) { setMode(null); setConfirmed(false); request.current = null; requestAnimationFrame(() => container.current?.focus()); }
      else setSaveFailed(true);
    } catch { setInvalid(true); }
  }
  return <div ref={container} tabIndex={-1} className="space-y-3">
    <p>{t(reduction.amountCents ? 'effectiveReduction' : 'reductionCancelled')}{reduction.amountCents ? <>: <bdi>{formatMoney(reduction.amountCents, locale, currency)}</bdi></> : null}</p>
    {reduction.amountCents > 0 ? <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => { setMode('REDUCTION_EDIT'); setEditingVersion(reduction.currentEventId); setConfirmed(false); setInvalid(false); }}>{t('editReduction')}</Button><Button variant="outline" disabled={disabled} onClick={() => { setMode('REDUCTION_CANCEL'); setEditingVersion(reduction.currentEventId); setConfirmed(false); setInvalid(false); }}>{t('cancelReduction')}</Button></div> : null}
    {mode && reduction.amountCents > 0 ? <form key={`${mode}:${editingVersion}`} onSubmit={e => void submit(e)} className="space-y-3 rounded-md border p-3" aria-label={t(mode)}>
      <p>{t('correctionNotice')}</p>
      {mode === 'REDUCTION_EDIT' ? <Field label={t('newReductionAmount')} htmlFor={`edit-reduction-${reduction.id}`} required><input id={`edit-reduction-${reduction.id}`} name="amount" className={inputClassName} inputMode="decimal" dir="ltr" defaultValue={decimalMoney(reduction.amountCents)} disabled={disabled} required /></Field> : null}
      <Field label={t('reason')} htmlFor={`reduction-reason-${reduction.id}`} required><textarea id={`reduction-reason-${reduction.id}`} name="reason" className={`${inputClassName} min-h-24`} maxLength={500} disabled={disabled} required /></Field>
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required disabled={disabled} />{t('confirmCorrection')}</label>
      {invalid ? <p role="alert">{t('invalid')}</p> : null}
      {saveFailed || editingVersion !== reduction.currentEventId ? <div className="space-y-2"><p role="alert">{t('correctionReview')}</p><Button type="button" variant="outline" disabled={disabled} onClick={onReload}>{t('retry')}</Button></div> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={disabled || !confirmed || editingVersion !== reduction.currentEventId}>{t('applyCorrection')}</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => { setMode(null); requestAnimationFrame(() => container.current?.focus()); }}>{t('cancel')}</Button></div>
    </form> : null}
  </div>;
}
