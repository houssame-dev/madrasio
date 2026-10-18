'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { Field, inputClassName } from '@/components/academic/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { parseMoney, schoolToday } from '@/lib/modules/finance/domain/contracts';
import type { paymentOptions, paymentHistory, paymentDetail } from '@/lib/modules/finance/application/payments';
import { formatMoney } from '@/lib/modules/finance/domain/csv';
type Options = Awaited<ReturnType<typeof paymentOptions>>;
type History = Awaited<ReturnType<typeof paymentHistory>>;
type Detail = Awaited<ReturnType<typeof paymentDetail>>;
interface StudentOption { id: string; firstName: string; lastName: string }

export function PaymentsWorkspace({ schoolId, timezone, currency, initialStudentId = '' }: { schoolId: string; timezone: string; currency: string; initialStudentId?: string }) {
  const common = useTranslations('finance'), t = useTranslations('financePayments'), locale = useLocale(), cache = useQueryClient();
  const [studentId, setStudentId] = useState(initialStudentId), [search, setSearch] = useState(''), [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH'), [date, setDate] = useState(schoolToday(timezone)), [reference, setReference] = useState('');
  const [values, setValues] = useState<Record<string, string>>({}), [confirmed, setConfirmed] = useState(false), [page, setPage] = useState(1), [detailId, setDetailId] = useState('');
  const [reason, setReason] = useState(''), [reverseConfirmed, setReverseConfirmed] = useState(false), [message, setMessage] = useState<'error' | 'conflict' | 'invalid' | 'success' | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null), reversalRequest = useRef<{ signature: string; id: string } | null>(null);
  const key = ['finance', schoolId];
  const students = useQuery({ queryKey: [...key, 'payment-students', search], queryFn: () => apiRequest<{ data: StudentOption[] }>(`/api/v1/finance/payments/students?search=${encodeURIComponent(search)}`), retry: false });
  const options = useQuery({ queryKey: [...key, 'payment-options', studentId], queryFn: () => apiRequest<{ data: Options }>(`/api/v1/finance/payments/options?studentId=${studentId}`), enabled: !!studentId, retry: false });
  const history = useQuery({ queryKey: [...key, 'payments', studentId, page], queryFn: () => apiRequest<{ data: History }>(`/api/v1/finance/payments?page=${page}${studentId ? `&studentId=${studentId}` : ''}`), retry: false });
  const detail = useQuery({ queryKey: [...key, 'payment', detailId], queryFn: () => apiRequest<{ data: Detail }>(`/api/v1/finance/payments/${detailId}`), enabled: !!detailId, retry: false });
  const mutation = useMutation({ mutationFn: (v: { path: `/api/v1/${string}`; body: unknown }) => apiRequest<{ data: { id: string } }>(v.path, { method: 'POST', body: JSON.stringify(v.body) }), retry: false });
  const money = (v: number, unit = currency) => formatMoney(v, locale, unit);
  const rows = options.data?.data.charges ?? [];
  const balance = (row: Options['charges'][number]) => row.originalCents - row.reductionCents - row.allocatedCents;
  let received = 0, allocated = 0, invalid = false;
  const allocations: { chargeId: string; amountCents: number }[] = [];
  try {
    if (amount) received = parseMoney(amount);
    for (const [chargeId, text] of Object.entries(values)) {
      if (!text || /^0(?:\.0{1,2})?$/.test(text)) continue;
      const amountCents = parseMoney(text); const row = rows.find(c => c.id === chargeId);
      if (!row || amountCents > balance(row)) invalid = true;
      allocations.push({ chargeId, amountCents }); allocated += amountCents;
    }
  } catch { invalid = true; }
  const ready = !!studentId && received > 0 && allocated === received && !invalid && allocations.length > 0 && confirmed && !!date && !options.isFetching;
  function fail(error: unknown) { setMessage(error instanceof ApiClientError && error.status === 409 ? 'conflict' : 'error'); }
  async function save() {
    if (!ready) { setMessage('invalid'); return; }
    const payload = { studentId, amountCents: received, method, receivedOn: date, reference, allocations, confirmed: true };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setMessage(null);
    try {
      const result = await mutation.mutateAsync({ path: '/api/v1/finance/payments', body: { ...payload, requestKey: request.current.id } });
      setDetailId(result.data.id); setValues({}); setAmount(''); setReference(''); setConfirmed(false); request.current = null; setMessage('success');
      await cache.invalidateQueries({ queryKey: key });
    } catch (error) { fail(error); }
  }
  async function reverse() {
    if (!reason.trim() || !reverseConfirmed) return;
    const signature = JSON.stringify({ detailId, reason }); if (reversalRequest.current?.signature !== signature) reversalRequest.current = { signature, id: crypto.randomUUID() };
    setMessage(null);
    try { await mutation.mutateAsync({ path: `/api/v1/finance/payments/${detailId}/reversal`, body: { reason, confirmed: true, requestKey: reversalRequest.current.id } }); setReason(''); setReverseConfirmed(false); reversalRequest.current = null; setMessage('success'); await cache.invalidateQueries({ queryKey: key }); }
    catch (error) { fail(error); }
  }
  const p = detail.data?.data;
  return <section className="space-y-5" aria-label={t('title')} aria-busy={mutation.isPending}>
    <h2 className="text-xl font-semibold">{t('title')}</h2><p>{t('notice')}</p>
    {message ? <p role={message === 'success' ? 'status' : 'alert'}>{t(message)}</p> : null}
    <Field label={t('search')} htmlFor="payment-search"><input id="payment-search" className={inputClassName} value={search} onChange={e => setSearch(e.target.value)} /></Field>
    {students.isError ? <p role="alert">{t('error')}<Button onClick={() => void students.refetch()}>{t('reload')}</Button></p> : null}
    <Field label={t('student')} htmlFor="payment-student"><select id="payment-student" className={inputClassName} disabled={mutation.isPending} value={studentId} onChange={e => { setStudentId(e.target.value); setPage(1); setValues({}); setConfirmed(false); setDetailId(''); setReason(''); setReverseConfirmed(false); setMessage(null); }}><option value="">{t('select')}</option>{studentId && options.data?.data.student && !students.data?.data.some(s => s.id === studentId) ? <option value={studentId}>{options.data.data.student.firstName} {options.data.data.student.lastName}</option> : null}{students.data?.data.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field>
    <form className="min-w-0 space-y-4 rounded-lg border p-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4"><div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('amount')} htmlFor="payment-amount" required><input id="payment-amount" className={inputClassName} dir="ltr" inputMode="decimal" required value={amount} onChange={e => { setAmount(e.target.value); setConfirmed(false); }} /></Field>
        <Field label={t('method')} htmlFor="payment-method"><select id="payment-method" className={inputClassName} value={method} onChange={e => { const v = e.target.value; if (v === 'CASH' || v === 'BANK_TRANSFER' || v === 'CHEQUE') setMethod(v); setConfirmed(false); }}>{(['CASH', 'BANK_TRANSFER', 'CHEQUE'] as const).map(v => <option key={v} value={v}>{t(v)}</option>)}</select></Field>
        <Field label={t('receivedOn')} htmlFor="payment-date" required><input id="payment-date" type="date" dir="ltr" min="1900-01-01" max={schoolToday(timezone)} required className={inputClassName} value={date} onChange={e => { setDate(e.target.value); setConfirmed(false); }} /></Field>
        <Field label={t('reference')} htmlFor="payment-reference"><input id="payment-reference" className={inputClassName} maxLength={100} value={reference} onChange={e => { setReference(e.target.value); setConfirmed(false); }} /></Field>
      </div>
      {options.isFetching ? <p role="status">{t('loading')}</p> : options.isError ? <p role="alert">{t('error')}<Button type="button" onClick={() => void options.refetch()}>{t('reload')}</Button></p> : null}
      <Button type="button" variant="outline" disabled={!received || !rows.length || options.isFetching} onClick={() => {
        let left = received; const suggested: Record<string, string> = {};
        for (const row of rows) { const n = Math.min(left, balance(row)); if (n > 0) suggested[row.id] = (n / 100).toFixed(2); left -= n; }
        setValues(suggested); setConfirmed(false);
      }}>{t('suggest')}</Button>
      {options.data?.data.hasMore ? <p>{t('allocationLimit')}</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="text-start">{t('allocation')}</caption><thead><tr>{(['fee', 'period', 'dueDate', 'remaining', 'allocated'] as const).map(k => <th className="p-2 text-start" key={k}>{t(k)}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="p-2" dir="auto">{row.feeName}</td><td className="p-2"><bdi>{row.period === 'once' ? common('once') : row.period}</bdi></td><td className="p-2"><bdi>{row.dueDate}</bdi></td><td className="p-2">{money(balance(row))}</td><td className="p-2"><input className={`${inputClassName} min-w-24`} aria-label={`${t('allocated')} ${row.feeName} ${row.period}`} dir="ltr" inputMode="decimal" value={values[row.id] ?? ''} onChange={e => { setValues({ ...values, [row.id]: e.target.value }); setConfirmed(false); }} /></td></tr>)}</tbody></table></div>
      <p>{t('total')}: {money(allocated)} · {t('difference')}: {money(received - allocated)}</p>
      {invalid ? <p role="alert">{t('invalid')}</p> : null}
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('confirm')}</label>
      <Button disabled={!ready}>{t('record')}</Button></fieldset>
    </form>
    <h2 className="text-xl font-semibold">{t('history')}</h2>
    {history.isPending ? <p role="status">{t('loading')}</p> : history.isError ? <p role="alert">{t('error')}<Button onClick={() => void history.refetch()}>{t('reload')}</Button></p> : !history.data.data.items.length ? <p>{t('empty')}</p> : history.data.data.items.map(({ payment, reversal }) => <article key={payment.id} className="space-y-2 rounded-md border p-3"><p dir="auto">{payment.studentName} · {money(payment.amountCents, payment.currency)} · {t(reversal ? 'REVERSED' : 'RECORDED')}</p><p><bdi className="break-all">{payment.receiptReference}</bdi> · <bdi>{payment.receivedOn}</bdi> · {t(payment.method)}</p><Button variant="outline" onClick={() => { setDetailId(payment.id); setReason(''); setReverseConfirmed(false); }}>{t('receipt')}</Button></article>)}
    <div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{t('previous')}</Button><Button variant="outline" disabled={page * 50 >= (history.data?.data.total ?? 0)} onClick={() => setPage(v => v + 1)}>{t('next')}</Button></div>
    {detailId ? <section className="space-y-3 rounded-lg border p-4" aria-label={t('receipt')}>
      {detail.isPending ? <p role="status">{t('loading')}</p> : detail.isError ? <p role="alert">{t('error')}<Button onClick={() => void detail.refetch()}>{t('reload')}</Button></p> : p ? <>
        <h3 className="font-semibold break-all">{p.payment.receiptReference}</h3><p>{t(p.reversal ? 'REVERSED' : 'RECORDED')} · {money(p.payment.amountCents, p.payment.currency)}</p>
        <p dir="auto">{p.payment.studentName}</p><p>{t(p.payment.method)} · <bdi>{p.payment.receivedOn}</bdi></p>
        <ul className="space-y-1">{p.allocations.map(a => <li key={a.id} dir="auto">{a.feeName} · <bdi>{a.period === 'once' ? common('once') : a.period}</bdi> · {money(a.amountCents, a.currency)}</li>)}</ul>
        <div className="flex flex-wrap gap-3"><Link className="underline" href={`/finance/receipts/${p.payment.id}`} target="_blank" rel="noopener">{t('print')}</Link><a className="underline" href={`/api/v1/finance/payments/${p.payment.id}/receipt?download=1`}>{t('download')}</a></div>
        {p.reversal ? <><p className="break-all">{t('reversalReference')}: {p.reversal.reversalReference}</p><p dir="auto">{p.reversal.reason}</p></> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void reverse(); }}><p>{t('reversalNotice')}</p><Field label={t('reason')} htmlFor="payment-reversal-reason" required><textarea id="payment-reversal-reason" className={`${inputClassName} min-h-24`} required maxLength={500} disabled={mutation.isPending} value={reason} onChange={e => { setReason(e.target.value); setReverseConfirmed(false); }} /></Field><label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={reverseConfirmed} disabled={mutation.isPending} onChange={e => setReverseConfirmed(e.target.checked)} />{t('confirmReverse')}</label><Button variant="destructive" disabled={mutation.isPending || !reverseConfirmed || !reason.trim()}>{t('reverse')}</Button></form>}
      </> : null}
    </section> : null}
  </section>;
}
