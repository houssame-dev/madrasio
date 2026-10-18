'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@school/ui';
import { apiRequest } from '@/lib/frontend/api-client';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { can } from '@/lib/frontend/permissions';
import type { paymentDetail } from '@/lib/modules/finance/application/payments';
export function PaymentReceipt({ id }: { id: string }) {
  const common = useTranslations('finance'), t = useTranslations('financePayments'), locale = useLocale();
  const context = useAppContext();
  const allowed = can(context.currentSchool?.role, 'finance.read');
  const query = useQuery({ queryKey: ['finance-receipt', context.user.id, context.currentSchool?.id, context.currentSchool?.role, id], queryFn: () => apiRequest<{ data: Awaited<ReturnType<typeof paymentDetail>> }>(`/api/v1/finance/payments/${id}`), enabled: allowed, retry: false, staleTime: 0 });
  if (!allowed) return <AccessDeniedWithReturn />;
  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError || !query.data) return <div role="alert">{t('error')}<Button onClick={() => void query.refetch()}>{t('reload')}</Button></div>;
  const { payment: p, allocations, reversal: r } = query.data.data;
  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'MAD' }).format(n / 100);
  const time = (v: unknown) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: p.schoolTimezone }).format(new Date(String(v)));
  return <section id="finance-receipt" className="mx-auto max-w-4xl space-y-4 rounded-lg border bg-background p-4 sm:p-6">
    <style>{'@media print{body *{visibility:hidden}#finance-receipt,#finance-receipt *{visibility:visible}#finance-receipt{position:absolute;inset:0;width:100%;max-width:none;border:0;padding:0}.finance-no-print{display:none!important}tr{break-inside:avoid}}@page{margin:16mm}'}</style>
    <div className="finance-no-print flex flex-wrap gap-3"><Link className="underline" href="/finance">{t('back')}</Link><Button onClick={() => window.print()}>{t('print')}</Button><a className="underline" href={`/api/v1/finance/payments/${p.id}/receipt?download=1`}>{t('download')}</a><Button variant="outline" onClick={() => void query.refetch()}>{t('reload')}</Button></div>
    <h1 className="text-2xl font-semibold">{t('receipt')}</h1><p>{t('notice')}</p><p className="finance-no-print">{t('printHelp')}</p>
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
      <dt>{t('receiptReference')}</dt><dd className="break-all"><bdi>{p.receiptReference}</bdi></dd><dt>{t('school')}</dt><dd dir="auto">{p.schoolName}</dd><dt>{t('student')}</dt><dd dir="auto">{p.studentName}</dd>
      <dt>{t('receivedOn')}</dt><dd><bdi>{p.receivedOn}</bdi></dd><dt>{t('method')}</dt><dd>{t(p.method)}</dd><dt>{t('reference')}</dt><dd dir="auto">{p.reference ?? '—'}</dd>
      <dt>{t('recordedBy')}</dt><dd className="break-all"><bdi>{p.recordedBy}</bdi></dd><dt>{t('recordedAt')}</dt><dd>{time(p.recordedAt)}</dd><dt>{t('total')}</dt><dd className="font-semibold">{money(p.amountCents)}</dd>
    </dl>
    <p className="font-semibold">{t(r ? 'REVERSED' : 'RECORDED')}</p>
    {r ? <div className="space-y-2 border p-3"><p>{t('reversalNotice')}</p><p className="break-all">{t('reversalReference')}: <bdi>{r.reversalReference}</bdi></p><p dir="auto">{r.reason}</p><p className="break-all">{t('reversedBy')}: <bdi>{r.reversedBy}</bdi></p><p>{t('reversedAt')}: {time(r.reversedAt)}</p></div> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm"><caption>{t('allocation')}</caption><thead><tr>{(['fee', 'period', 'dueDate', 'allocated'] as const).map(k => <th className="p-2 text-start" key={k}>{t(k)}</th>)}</tr></thead><tbody>{allocations.map(a => <tr key={a.id}><td className="p-2" dir="auto">{a.feeName}</td><td className="p-2"><bdi>{a.period === 'once' ? common('once') : a.period}</bdi></td><td className="p-2"><bdi>{a.dueDate}</bdi></td><td className="p-2">{money(a.amountCents)}</td></tr>)}</tbody></table></div>
  </section>;
}
