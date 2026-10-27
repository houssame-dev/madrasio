'use client';
import { useEffect,useRef,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale,useTranslations } from 'next-intl';
import Link from 'next/link';
import { Wallet,ReceiptText,ArrowRight } from 'lucide-react';
import { useAppContext } from '@/components/app/app-context';
import { InlineLoading,ApiErrorState } from '@/components/ui/states';
import { apiRequest } from '@/lib/frontend/api-client';
import { formatMoney } from '@/lib/modules/finance/domain/csv';
import type { parentTuition,parentReceipt } from '@/lib/modules/finance/application/parent-reads';
import { ChargeStatus,FinanceTable } from './presentation';
import './tuition.css';
type Tuition=Awaited<ReturnType<typeof parentTuition>>;
type Receipt=Awaited<ReturnType<typeof parentReceipt>>;
export function ChildTuition({studentId,studentName}:{studentId:string;studentName:string}) {
  const app=useAppContext(),t=useTranslations('tuition'),c=useTranslations('finance'),p=useTranslations('financePayments'),locale=useLocale();
  const [tab,setTab]=useState<'charges'|'payments'>('charges'),[page,setPage]=useState(1);
  const query=useQuery({queryKey:['child-tuition',app.currentSchool!.id,app.user.id,studentId,page],queryFn:async()=>(await apiRequest<{data:Tuition}>(`/api/v1/parent/children/${studentId}/tuition?page=${page}`)).data,retry:false});
  const anchor=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(window.location.hash!=='#tuition'||!anchor.current?.parentElement)return;
    // Academic reads above this section can finish after the fragment is mounted.
    // Keep the initial destination visible as they settle; user input ends alignment.
    let frame=0;
    const align=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>anchor.current?.scrollIntoView({block:'start',behavior:'auto'}));};
    const observer=new ResizeObserver(align);
    observer.observe(anchor.current.parentElement);
    const events=['pointerdown','wheel','touchstart','keydown'] as const;
    const stop=()=>{observer.disconnect();cancelAnimationFrame(frame);events.forEach(event=>window.removeEventListener(event,stop));};
    events.forEach(event=>window.addEventListener(event,stop,{passive:true}));
    align();
    return stop;
  },[studentId,query.isPending]);
  const d=query.data,money=(n:number,currency=d?.currency??'MAD')=>formatMoney(n,locale,currency);
  return <section ref={anchor} className="tuition-workspace ws-card" id="tuition"><header className="ws-card-heading"><h2><Wallet aria-hidden="true" />{t('childTitle')}</h2></header><p className="tu-child-name"><bdi>{studentName}</bdi></p><p className="tu-copy">{t('childIntro')}</p>
    {query.isPending?<InlineLoading />:query.isError||!d?<ApiErrorState title={t('error')} onRetry={()=>void query.refetch()} />:<>
      <div className="tu-metrics">{[[t('remaining'),d.summary.outstandingCents],[t('paid'),d.summary.paidCents],[t('total'),d.summary.netCents]].map(([label,n])=><article className="ws-card" key={label}><p>{label}</p><strong><bdi>{money(Number(n))}</bdi></strong></article>)}</div>
      <nav className="tu-tabs" aria-label={t('childTitle')}><button aria-current={tab==='charges'?'page':undefined} onClick={()=>{setTab('charges');setPage(1);}}>{t('chargesTab')}</button><button aria-current={tab==='payments'?'page':undefined} onClick={()=>{setTab('payments');setPage(1);}}>{t('historyTab')}</button></nav>
      {tab==='charges'?<div className="tu-child-list">{!d.charges.length?<p>{t('empty')}</p>:d.charges.map(ch=><article key={ch.id}><div><h3><bdi>{ch.feeName}</bdi></h3><p><bdi>{ch.period==='once'?c('once'):ch.period}</bdi> · {c('dueDate')}: <time dateTime={ch.dueDate}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(ch.dueDate+'T12:00:00Z'))}</time></p><ChargeStatus {...ch} /></div><div><strong><bdi>{money(ch.status==='CANCELLED'?0:ch.originalCents-ch.reductionCents-ch.allocatedCents,ch.currency)}</bdi></strong><p>{t('paid')}: <bdi>{money(ch.allocatedCents,ch.currency)}</bdi></p><p>{t('total')}: <bdi>{money(ch.status==='CANCELLED'?0:ch.originalCents-ch.reductionCents,ch.currency)}</bdi></p></div></article>)}</div>:<div className="tu-child-list">{!d.payments.length?<p>{t('noPayments')}</p>:d.payments.map(({payment:pay,reversal})=><Link key={pay.id} href={`/children/${studentId}/tuition/receipts/${pay.id}`}><span className="ws-stat-icon ws-tone-blue"><ReceiptText aria-hidden="true" /></span><div><h3><bdi>{money(pay.amountCents,pay.currency)}</bdi></h3><p><bdi>{pay.receivedOn}</bdi> · {p(pay.method)}</p><p>{p(reversal?'REVERSED':'RECORDED')}</p><small><bdi>{pay.receiptReference}</bdi></small></div><ArrowRight aria-hidden="true" className="tu-arrow" /></Link>)}</div>}
      <div className="tu-pagination"><button className="ws-action" disabled={page===1} onClick={()=>setPage(v=>v-1)}>{c('previous')}</button><span>{page} / {Math.max(1,Math.ceil((tab==='charges'?d.chargeTotal:d.paymentTotal)/20))}</span><button className="ws-action" disabled={page*20>=(tab==='charges'?d.chargeTotal:d.paymentTotal)} onClick={()=>setPage(v=>v+1)}>{c('next')}</button></div>
    </>}
  </section>;
}
export function ChildReceipt({studentId,paymentId}:{studentId:string;paymentId:string}) {
  const app=useAppContext(),t=useTranslations('tuition'),p=useTranslations('financePayments'),c=useTranslations('finance'),locale=useLocale();
  const enabled=app.currentSchool?.role==='PARENT';
  const query=useQuery({queryKey:['child-receipt',app.currentSchool?.id,app.user.id,studentId,paymentId],queryFn:async()=>(await apiRequest<{data:Receipt}>(`/api/v1/parent/children/${studentId}/tuition/receipts/${paymentId}`)).data,enabled,retry:false});
  if(!enabled)return <ApiErrorState title={t('error')} />;
  if(query.isPending)return <InlineLoading />;
  if(query.isError||!query.data)return <ApiErrorState title={t('error')} onRetry={()=>void query.refetch()} />;
  const {payment:pay,allocations,reversal}=query.data,money=(n:number)=>formatMoney(n,locale,pay.currency);
  return <section className="tuition-workspace tu-receipt ws-card" id="child-tuition-receipt"><div className="tu-no-print tu-receipt-actions"><Link className="ws-action" href={`/children/${studentId}#tuition`}>{t('back')}</Link><button className="ws-action" onClick={()=>window.print()}>{t('print')}</button><a className="ws-action ws-action-primary" href={`/api/v1/parent/children/${studentId}/tuition/receipts/${paymentId}?download=1`}>{t('download')}</a></div>
    <header><h1>{t('receipt')}</h1><p><bdi>{pay.schoolName}</bdi></p><strong><bdi>{pay.receiptReference}</bdi></strong></header><p className="tu-copy">{t('previewOnly')}</p><dl className="tu-receipt-details">{[[p('student'),pay.studentName],[p('receivedOn'),pay.receivedOn],[p('method'),p(pay.method)],[p('reference'),pay.reference??'—'],[p('total'),money(pay.amountCents)],[c('status'),p(reversal?'REVERSED':'RECORDED')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl>
    {reversal?<p className="tu-reversal">{p('reversalNotice')} · <bdi>{reversal.reversalReference}</bdi></p>:null}
    <FinanceTable caption={p('allocation')} columns={[p('fee'),p('period'),p('dueDate'),p('allocated')]} rows={allocations.map(a=>({id:a.id,cells:[a.feeName,a.period==='once'?c('once'):a.period,a.dueDate,money(a.amountCents)]}))} />
    <style>{'@media print{body *{visibility:hidden}#child-tuition-receipt,#child-tuition-receipt *{visibility:visible}#child-tuition-receipt{position:absolute;inset:0;max-width:none;background:white;color:black;border:0}#child-tuition-receipt *{background:transparent;color:inherit}.tu-no-print{display:none!important}tr{break-inside:avoid}}@page{margin:16mm}'}</style>
  </section>;
}
