'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale,useTranslations } from 'next-intl';
import Link from 'next/link';
import { Wallet,Users,ReceiptText,CalendarDays } from 'lucide-react';
import { apiRequest } from '@/lib/frontend/api-client';
import { formatMoney } from '@/lib/modules/finance/domain/csv';
import type { tuitionOverview } from '@/lib/modules/finance/application/overview';
import { InlineLoading,ApiErrorState } from '@/components/ui/states';
type Overview=Awaited<ReturnType<typeof tuitionOverview>>;
export function TuitionOverview({schoolId,year,onPayment,onStudent}:{schoolId:string;year:string;onPayment:()=>void;onStudent:(id:string)=>void}) {
  const t=useTranslations('tuition'),p=useTranslations('financePayments'),locale=useLocale();
  const query=useQuery({queryKey:['finance',schoolId,'overview',year],queryFn:async()=>(await apiRequest<{data:Overview}>(`/api/v1/finance/overview${year?'?academicYearId='+year:''}`)).data,retry:false});
  const d=query.data,money=(n:number)=>formatMoney(n,locale,d?.currency??'MAD');
  if(query.isPending)return <InlineLoading />;
  if(query.isError||!d)return <ApiErrorState title={t('error')} onRetry={()=>void query.refetch()} />;
  const methods=[{label:p('CASH'),value:d.collections.cashCents},{label:p('BANK_TRANSFER'),value:d.collections.bankCents},{label:p('CHEQUE'),value:d.collections.chequeCents}];
  return <div className="tu-overview"><div className="tu-overview-actions"><button className="ws-action ws-action-primary" onClick={onPayment}><ReceiptText aria-hidden="true" />{t('record')}</button></div><div className="tu-metrics">{[{label:t('outstanding'),value:money(d.summary.outstandingCents),Icon:Wallet},{label:t('overdue'),value:new Intl.NumberFormat(locale).format(d.summary.overdueStudents),Icon:Users},{label:t('collected'),value:money(d.collections.netCents),Icon:ReceiptText},{label:t('chargedStudents'),value:new Intl.NumberFormat(locale).format(d.summary.students),Icon:CalendarDays}].map(({label,value,Icon})=><article key={label} className="ws-card"><span className="ws-stat-icon ws-tone-orange"><Icon aria-hidden="true" /></span><div><p>{label}</p><strong><bdi>{value}</bdi></strong></div></article>)}</div><p className="tu-copy">{t('scope')}</p>
    <div className="tu-two-columns"><section className="ws-card"><header className="ws-card-heading"><h2>{t('byClass')}</h2></header>{d.byClass.length?<ul className="tu-bars">{d.byClass.map(r=><li key={r.classId}><span><bdi>{r.className}</bdi><bdi>{money(r.balance)}</bdi></span><div aria-hidden="true"><span style={{width:`${r.balance/Math.max(1,d.byClass[0].balance)*100}%`}} /></div></li>)}</ul>:<p className="tu-empty">{t('empty')}</p>}</section><section className="ws-card"><header className="ws-card-heading"><h2>{t('methods')}</h2></header><strong className="tu-collection-total"><bdi>{money(d.collections.netCents)}</bdi></strong><ul className="tu-methods">{methods.map(m=><li key={m.label}><span>{m.label}</span><strong><bdi>{money(m.value)}</bdi></strong></li>)}</ul></section></div>
    <div className="tu-two-columns"><section className="ws-card"><header className="ws-card-heading"><h2>{t('followUp')}</h2></header>{d.overdue.length?<ul className="tu-follow-up">{d.overdue.map(r=><li key={r.studentId}><button onClick={()=>onStudent(r.studentId)}><strong><bdi>{r.studentName}</bdi></strong><span>{r.dueDate}</span><bdi>{money(r.balance)}</bdi></button></li>)}</ul>:<p className="tu-empty">{t('none')}</p>}</section><section className="ws-card"><header className="ws-card-heading"><h2>{t('recent')}</h2></header>{d.recent.length?<ul className="tu-follow-up">{d.recent.map(r=><li key={r.id}><Link href={`/finance/receipts/${r.id}`}><strong><bdi>{r.studentName}</bdi></strong><span>{r.receivedOn} · {p(r.method)} · {p(r.reversalReference?'REVERSED':'RECORDED')}</span><bdi>{money(r.amountCents)}</bdi></Link></li>)}</ul>:<p className="tu-empty">{t('noPayments')}</p>}</section></div>
  </div>;
}
