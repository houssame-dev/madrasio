'use client';
import { FinanceTable, ChargeStatus } from './presentation';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { Field, inputClassName } from '@/components/academic/ui';
import { apiRequest } from '@/lib/frontend/api-client';
import { schoolToday } from '@/lib/modules/finance/domain/contracts';
import { formatMoney } from '@/lib/modules/finance/domain/csv';
import type { collectionsReport, outstandingReport, studentBalance } from '@/lib/modules/finance/application/reports';

type Outstanding = Awaited<ReturnType<typeof outstandingReport>>;
type Collections = Awaited<ReturnType<typeof collectionsReport>>;
type Balance = Awaited<ReturnType<typeof studentBalance>>;
type Option = { id: string; name: string };
export function ReportsWorkspace({ schoolId, timezone, years, classes, onPayments }: { schoolId: string; timezone: string; years: Option[]; classes: (Option & { academicYearId: string })[]; onPayments: (studentId: string) => void }) {
  const ui = useTranslations('financeUi');
  const t = useTranslations('financeReports'), c = useTranslations('finance'), p = useTranslations('financePayments'), locale = useLocale();
  const today = schoolToday(timezone);
  const [mode, setMode] = useState<'outstanding' | 'collections'>('outstanding'), [year, setYear] = useState(''), [classId, setClass] = useState(''), [studentId, setStudent] = useState(''), [search, setSearch] = useState('');
  const [from, setFrom] = useState(today.slice(0, 7) + '-01'), [to, setTo] = useState(today), [page, setPage] = useState(1), [balanceId, setBalance] = useState('');
  const [exportState, setExportState] = useState<'busy' | 'error' | 'success' | null>(null);
  const key = ['finance', schoolId, 'reports'];
  const query = new URLSearchParams({ page: String(page) });
  if (studentId) query.set('studentId', studentId);
  if (mode === 'collections') { query.set('from', from); query.set('to', to); }
  else { if (year) query.set('academicYearId', year); if (classId) query.set('classId', classId); }
  const path = `/api/v1/finance/reports/${mode}?${query}` as const;
  const outstanding = useQuery({ queryKey: [...key, 'outstanding', query.toString()], queryFn: () => apiRequest<{ data: Outstanding }>(path), enabled: mode === 'outstanding', retry: false });
  const collections = useQuery({ queryKey: [...key, 'collections', query.toString()], queryFn: () => apiRequest<{ data: Collections }>(path), enabled: mode === 'collections' && !!from && !!to && from <= to, retry: false });
  const students = useQuery({ queryKey: [...key, 'students', search], queryFn: () => apiRequest<{ data: { id: string; firstName: string; lastName: string }[] }>(`/api/v1/finance/payments/students?search=${encodeURIComponent(search)}`), retry: false });
  const active = mode === 'outstanding' ? outstanding : collections;
  const o = outstanding.data?.data, r = collections.data?.data;
  const money = (n: number) => formatMoney(n, locale, (mode === 'outstanding' ? o?.currency : r?.currency) ?? 'MAD');
  const total = mode === 'outstanding' ? o?.summary.students ?? 0 : r?.total ?? 0;
  function change(action: () => void) { action(); setPage(1); setExportState(null); }
  async function download() {
    setExportState('busy');
    try {
      const response = await fetch(`${path}&format=csv`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/csv')) throw new Error();
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
      link.href = url; link.download = `finance-${mode}.csv`; document.body.append(link); link.click(); link.remove();
      // Allow the browser to consume the blob before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 1000); setExportState('success');
    } catch { setExportState('error'); }
  }
  return <section className="min-w-0 space-y-5" aria-label={t('title')}>
    <h2 className="text-xl font-semibold">{t('title')}</h2>
    <div className="flex flex-wrap gap-2">{(['outstanding', 'collections'] as const).map(v => <Button key={v} variant={mode === v ? 'default' : 'outline'} aria-current={mode === v ? 'page' : undefined} onClick={() => change(() => setMode(v))}>{t(v)}</Button>)}</div>
    <p>{t(mode === 'outstanding' ? 'semantics' : 'collectionNotice')}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={c('search')} htmlFor="report-search"><input id="report-search" className={inputClassName} value={search} onChange={e => setSearch(e.target.value)} /></Field>
      <Field label={c('student')} htmlFor="report-student"><select id="report-student" className={inputClassName} value={studentId} onChange={e => change(() => setStudent(e.target.value))}><option value="">{c('all')}</option>{students.data?.data.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field>
      {mode === 'outstanding' ? <>
        <Field label={c('year')} htmlFor="report-year"><select id="report-year" className={inputClassName} value={year} onChange={e => change(() => { setYear(e.target.value); setClass(''); })}><option value="">{c('all')}</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
        <Field label={c('class')} htmlFor="report-class"><select id="report-class" className={inputClassName} value={classId} onChange={e => change(() => setClass(e.target.value))}><option value="">{c('all')}</option>{classes.filter(v => !year || v.academicYearId === year).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      </> : <>
        <Field label={t('from')} htmlFor="report-from"><input id="report-from" className={inputClassName} type="date" dir="ltr" aria-invalid={!from || (!!to && from > to)} value={from} onChange={e => change(() => setFrom(e.target.value))} /></Field>
        <Field label={t('to')} htmlFor="report-to"><input id="report-to" className={inputClassName} type="date" dir="ltr" aria-invalid={!to || (!!from && from > to)} value={to} min={from} onChange={e => change(() => setTo(e.target.value))} /></Field>
      </>}
    </div>
    {students.isError ? <p role="alert">{c('error')}<Button onClick={() => void students.refetch()}>{c('retry')}</Button></p> : null}
    {mode === 'collections' && (!from || !to || from > to) ? <p role="alert">{ui('dateRange')}</p> : active.isPending ? <p role="status">{c('loading')}</p> : active.isError ? <p role="alert">{c('error')}<Button onClick={() => void active.refetch()}>{c('retry')}</Button></p> : <>
      <p>{t('asOf')}: <bdi>{mode === 'outstanding' ? o?.today : r?.today}</bdi> · <bdi>{timezone}</bdi></p>
      <section aria-label={t('summary')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(mode === 'outstanding' && o ? [[t('net'), money(o.summary.netCents)], [t('paid'), money(o.summary.paidCents)], [c('outstanding'), money(o.summary.outstandingCents)], [t('overdueStudents'), String(o.summary.overdueStudents)]] : r ? [[t('collected'), money(r.netCents)], [t('gross'), money(r.grossCents)], [t('reversed'), money(r.reversedCents)], [p('CASH'), money(r.cashCents)], [p('BANK_TRANSFER'), money(r.bankCents)], [p('CHEQUE'), money(r.chequeCents)]] : []).map(([label, value]) => <div key={label} className="min-w-0 rounded-md border bg-card p-3"><p>{label}</p><p className="break-words text-xl font-semibold">{value}</p></div>)}
      </section>
      <Button disabled={exportState === 'busy' || active.isFetching} onClick={() => void download()}>{t('export')}</Button>
      {exportState === 'error' ? <p role="alert">{t('exportError')}</p> : exportState === 'success' ? <p role="status">{t('exportSuccess')}</p> : null}
      {!total ? <p>{c('empty')}</p> : <FinanceTable caption={t(mode)} columns={mode === 'outstanding' ? [c('student'), t('net'), t('paid'), c('outstanding'), t('notOverdue'), t('days1to30'), t('days31to60'), t('days61plus'), c('detail')] : [p('receivedOn'), c('student'), p('method'), c('amount'), c('status'), p('receipt')]} rows={mode === 'outstanding' ? (o?.items ?? []).map(row => ({ id: row.studentId, cells: [<bdi key="student">{row.studentName}</bdi>, ...[row.netCents, row.paidCents, row.outstandingCents, row.notOverdueCents, row.days1to30Cents, row.days31to60Cents, row.days61plusCents].map(n => money(n)), <Button key="show" variant="outline" onClick={() => setBalance(row.studentId)}>{t('show')}</Button>] })) : (r?.items ?? []).map(row => ({ id: row.id, cells: [<bdi key="date">{row.receivedOn}</bdi>, <bdi key="student">{row.studentName}</bdi>, p(row.method), money(row.amountCents), <div key="status" className="break-all">{row.reversalReference ? p('REVERSED') : p('RECORDED')}<p><bdi>{row.reversalReference}</bdi></p></div>, <Link key="receipt" className="break-all underline" href={`/finance/receipts/${row.id}`}><bdi>{row.receiptReference}</bdi></Link>] }))} />}
      <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{c('previous')}</Button><span>{page} / {Math.max(1, Math.ceil(total / 50))}</span><Button variant="outline" disabled={page * 50 >= total} onClick={() => setPage(v => v + 1)}>{c('next')}</Button></div>
    </>}
    {studentId ? <Button variant="outline" onClick={() => setBalance(studentId)}>{t('show')}</Button> : null}
    {balanceId ? <StudentOverview key={balanceId} schoolId={schoolId} id={balanceId} onClose={() => setBalance('')} onPayments={onPayments} /> : null}
  </section>;
}
export function StudentOverview({ schoolId, id, onClose, onPayments }: { schoolId: string; id: string; onClose: () => void; onPayments: (id: string) => void }) {
  const t = useTranslations('financeReports'), c = useTranslations('finance'), locale = useLocale(); const [page, setPage] = useState(1);
  const balance = useQuery({ queryKey: ['finance', schoolId, 'balance', id, page], queryFn: () => apiRequest<{ data: Balance }>(`/api/v1/finance/students/${id}/balance?page=${page}`), retry: false });
  const d = balance.data?.data; const money = (n: number) => formatMoney(n, locale, d?.currency ?? 'MAD');
  return <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label={t('balance')}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-xl font-semibold">{t('balance')}</h3><Button variant="ghost" onClick={onClose}>{c('close')}</Button></div>
    {balance.isPending ? <p role="status">{c('loading')}</p> : balance.isError || !d ? <p role="alert">{c('error')}<Button onClick={() => void balance.refetch()}>{c('retry')}</Button></p> : <>
      <p><bdi>{d.student.firstName} {d.student.lastName}</bdi> · {t('asOf')} <bdi>{d.today}</bdi></p>
      <dl className="grid gap-2 sm:grid-cols-3">{[[t('net'), d.summary.netCents], [t('validPayments'), d.validPaymentsCents], [c('outstanding'), d.summary.outstandingCents]].map(([label, n]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{money(Number(n))}</dd></div>)}</dl>
      <Button variant="outline" onClick={() => onPayments(id)}>{t('history')}</Button>
      {!d.items.length ? <p>{c('empty')}</p> : <FinanceTable caption={t('balance')} columns={[c('year'), c('feeType'), c('period'), c('dueDate'), t('net'), t('paid'), c('outstanding'), c('status')]} rows={d.items.map(({ charge, academicYear }) => {
        const net = charge.status === 'CANCELLED' ? 0 : charge.originalCents - charge.reductionCents, remaining = net - charge.allocatedCents;
        return { id: charge.id, cells: [<bdi key="year">{academicYear}</bdi>, <bdi key="fee">{charge.feeName}</bdi>, <bdi key="period">{charge.period === 'once' ? c('once') : charge.period}</bdi>, <bdi key="date">{charge.dueDate}</bdi>, ...[net, charge.allocatedCents, remaining].map(n => money(n)), <div key="status"><ChargeStatus {...charge} />{remaining > 0 && charge.dueDate < d.today ? <p>{t('overdue')}</p> : null}</div>] };
      })} />}
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{c('previous')}</Button><span>{page} / {Math.max(1, Math.ceil(d.total / 50))}</span><Button variant="outline" disabled={page * 50 >= d.total} onClick={() => setPage(v => v + 1)}>{c('next')}</Button></div>
    </>}
  </section>;
}
