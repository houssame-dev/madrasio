'use client';
import { useSearchParams } from 'next/navigation';
import { TuitionOverview } from './tuition-overview';
import { StudentsBalances } from './students-balances';
import './tuition.css';
import { FinanceTable, ChargeStatus } from './presentation';
import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { Field, inputClassName } from '@/components/academic/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { can } from '@/lib/frontend/permissions';
import { parseMoney, schoolToday, type ChargeSelection } from '@/lib/modules/finance/domain/contracts';
import type { chargeDetail, listFinance, previewCharges } from '@/lib/modules/finance/application/service';
import { PaymentsWorkspace } from './payments-workspace';
import { ReportsWorkspace } from './reports-workspace';
import { ReductionHistory } from './reduction-history';
import { FINANCE_CURRENCIES } from '@/lib/modules/finance/domain/currency';
import { formatMoney } from '@/lib/modules/finance/domain/csv';

type State = Awaited<ReturnType<typeof listFinance>>;
type Preview = Awaited<ReturnType<typeof previewCharges>>;
type Detail = Awaited<ReturnType<typeof chargeDetail>>;
type Structure = State['structures'][number];
type Write = { path: `/api/v1/${string}`; body: unknown; method?: 'POST' | 'PATCH' };
type FeePeriod = { period: string; dueDate: string };
type Copy = ReturnType<typeof useTranslations<'finance'>>;

export function FinanceWorkspace() {
  const context = useAppContext();
  if (!can(context.currentSchool?.role, 'finance.manage')) return <AccessDeniedWithReturn />;
  return <FinanceScreen key={`${context.user.id}:${context.currentSchool!.id}`} schoolId={context.currentSchool!.id} timezone={context.currentSchool!.timezone} />;
}

function FinanceScreen({ schoolId, timezone }: { schoolId: string; timezone: string }) {
  const paymentT=useTranslations('financePayments'); const tuition = useTranslations('tuition'); const t = useTranslations('finance'); const locale = useLocale(); const cache = useQueryClient();
  const params=useSearchParams();
  type Tab='overview'|'students'|'configuration'|'generation'|'charges'|'payments'|'reports';
  const initial=params?.get('section')??'overview';
  const [tab, changeTab] = useState<Tab>(['overview','students','configuration','generation','charges','payments','reports'].includes(initial)?initial as Tab:'overview');
  function persist(section:Tab,student?:string,academicYear?:string){const q=new URLSearchParams(window.location.search);q.set('section',section);if(student!==undefined){if(student)q.set('studentId',student);else q.delete('studentId');}if(academicYear!==undefined){if(academicYear)q.set('academicYearId',academicYear);else q.delete('academicYearId');}window.history.replaceState(window.history.state,'',`${window.location.pathname}?${q}`);}
  function setTab(next:Tab,student?:string){changeTab(next);persist(next,student);}

  const [configSection,setConfigSection]=useState('types');
  const [paymentStudent, setPaymentStudent] = useState(params?.get('studentId')??'');
  const [year, setYear] = useState(params?.get('academicYearId')??''); const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const [status, setStatus] = useState(''); const [studentFilter, setStudentFilter] = useState(params?.get('studentId')??'');
  const [message, setMessage] = useState<'success' | 'error' | 'invalid' | 'conflict' | null>(null);
  const [edit, setEdit] = useState<Structure | null | undefined>(undefined);
  const [structureId, setStructureId] = useState(''); const [mode, setMode] = useState<'individual' | 'class' | 'level'>('individual');
  const [studentIds, setStudentIds] = useState<string[]>([]); const [groupId, setGroupId] = useState(''); const [periods, setPeriods] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<{ selection: ChargeSelection; preview: Preview; requestKey: string } | null>(null);
  const [previewPage, setPreviewPage] = useState(0); const [detailId, setDetailId] = useState('');
  const [adjustKind, setAdjustKind] = useState<'REDUCTION' | 'CANCELLATION'>('REDUCTION');
  const adjustmentRequest = useRef<{ signature: string; key: string } | null>(null);
  const key = ['finance', schoolId];
  const query = new URLSearchParams({ page: String(page), search });
  if (year) query.set('academicYearId', year); if (status) query.set('status', status); if (studentFilter) query.set('studentId', studentFilter);
  const state = useQuery({ queryKey: [...key, year, page, search, status, studentFilter], queryFn: () => apiRequest<{ data: State }>(`/api/v1/finance?${query}`), placeholderData: previous => previous, retry: false });
  const detail = useQuery({ queryKey: [...key, 'detail', detailId], queryFn: () => apiRequest<{ data: Detail }>(`/api/v1/finance/charges/${detailId}`), enabled: !!detailId, retry: false });
  const writes = useMutation({ mutationFn: (input: Write) => apiRequest<{ data: unknown }>(input.path, { method: input.method ?? 'POST', body: JSON.stringify(input.body) }), retry: false });
  const previewMutation = useMutation({ mutationFn: (selection: ChargeSelection) => apiRequest<{ data: Preview }>('/api/v1/finance/charges/preview', { method: 'POST', body: JSON.stringify(selection) }), retry: false });
  const busy = writes.isPending || previewMutation.isPending;
  const money = (cents: number, currency = state.data?.data.settings.currency ?? 'MAD') => formatMoney(cents, locale, currency);
  function failure(error: unknown) { setMessage(error instanceof ApiClientError && error.status === 409 ? 'conflict' : 'error'); }
  async function write(input: Write) {
    setMessage(null);
    try { await writes.mutateAsync(input); setMessage('success'); await cache.invalidateQueries({ queryKey: key }); return true; }
    catch (error) { failure(error); return false; }
  }
  function resetPreview() { setPrepared(null); setMessage(null); }
  async function preview() {
    resetPreview();
    const selection: ChargeSelection = { structureId, periods, ...(mode === 'individual' ? { studentIds } : mode === 'class' ? { classId: groupId } : { levelId: groupId }) };
    try { const result = await previewMutation.mutateAsync(selection); setPrepared({ selection, preview: result.data, requestKey: crypto.randomUUID() }); setPreviewPage(0); }
    catch (error) { failure(error); }
  }
  const data = state.data?.data;
  const selectedStructure = data?.structures.find(s => s.id === structureId);
  const charge = detail.data?.data.charge;
  const canCancel = !!charge && charge.status === 'OPEN' && charge.allocatedCents === 0 && charge.dueDate > schoolToday(timezone);
  if (state.isPending) return <p role="status">{t('loading')}</p>;
  if (state.isError || !data) return <div role="alert"><p>{t('error')}</p><Button onClick={() => void state.refetch()}>{t('retry')}</Button></div>;
  return <div className="tuition-workspace ws-dashboard" aria-busy={busy || state.isFetching}>
    <header><h1 className="text-2xl font-semibold">{tuition('title')}</h1><p className="text-muted-foreground">{tuition('intro')} · <bdi>{data.settings.currency}</bdi></p></header>
    <nav aria-label={tuition('title')} className="tu-tabs">{(['overview','students','payments','charges','configuration','reports'] as const).map(v=><button type="button" key={v} aria-current={tab===v||(v==='charges'&&tab==='generation')?'page':undefined} onClick={()=>{setTab(v);if(v==='reports'){setYear('');setPage(1);persist(v,undefined,'');}setMessage(null);}}>{tuition(v)}</button>)}</nav>
    {tab !== 'payments' && tab !== 'reports' && tab !== 'students' ? <div className="tu-year-filter"><Field label={t('year')} htmlFor="finance-year"><select className={inputClassName} id="finance-year" value={year} disabled={busy} onChange={e => { setYear(e.target.value); persist(tab,undefined,e.target.value); setPage(1); setStructureId(''); setEdit(undefined); resetPreview(); }}><option value="">{t('all')}</option>{data.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field></div> : null}
    {tab==='overview'?<TuitionOverview schoolId={schoolId} year={year} onPayment={()=>setTab('payments')} onStudent={id=>{setStudentFilter(id);setTab('students',id);}} />:null}
    {tab==='students'?<StudentsBalances schoolId={schoolId} students={data.students} search={search} onSearch={setSearch} studentId={studentFilter} onStudent={id=>{setStudentFilter(id);persist('students',id);}} onPayments={id=>{setPaymentStudent(id);setTab('payments',id);}} />:null}
    {tab==='charges'||tab==='generation'?<div className="tu-subtabs"><button className="ws-action" aria-pressed={tab==='charges'} onClick={()=>setTab('charges')}>{tuition('charges')}</button><button className="ws-action" aria-pressed={tab==='generation'} onClick={()=>setTab('generation')}>{t('generation')}</button></div>:null}
    {tab === 'payments' ? <PaymentsWorkspace initialStudentId={paymentStudent} schoolId={schoolId} timezone={timezone} currency={data.settings.currency} /> : null}
    {tab === 'reports' ? <ReportsWorkspace schoolId={schoolId} timezone={timezone} years={data.years} classes={data.classes} onPayments={id => { setPaymentStudent(id); setTab('payments',id); }} /> : null}
    {message ? <p role={['success'].includes(message) ? 'status' : 'alert'} className="min-w-0 rounded-md border bg-card p-3">{t(message)}</p> : null}

    {tab === 'configuration' ? <section className="space-y-5" aria-label={t('configuration')}>
      <nav className="tu-tabs" aria-label={tuition('configuration')}>{(['types','structures','currency'] as const).map(v=><button type="button" key={v} aria-current={configSection===v?'page':undefined} onClick={()=>setConfigSection(v)}>{tuition(v)}</button>)}</nav>
      {configSection==='currency'?<div>
      <form key={data.settings.currency} className="space-y-3 min-w-0 rounded-lg border bg-card p-4" onSubmit={e => { e.preventDefault(); const currency = String(new FormData(e.currentTarget).get('currency')); void write({ path: '/api/v1/finance/settings', method: 'PATCH', body: { currency } }); }}>
        <Field label={t('currency')} htmlFor="finance-currency"><select id="finance-currency" name="currency" className={inputClassName} defaultValue={data.settings.currency} disabled={busy || data.settings.locked} aria-describedby="finance-currency-notice">{FINANCE_CURRENCIES.map(code => <option key={code} value={code}>{code} · {t(code)}</option>)}</select></Field>
        <p id="finance-currency-notice" className="text-sm text-muted-foreground">{t(data.settings.locked ? 'currencyLocked' : 'currencyNotice')}</p>
        <Button disabled={busy || data.settings.locked}>{t('save')}</Button>
      </form>
      </div>:null}
      {configSection==='types'?<div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('feeType')}</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get('name') ?? ''); void write({ path: '/api/v1/finance/fee-types', body: { name } }).then(ok => { if (ok) form.reset(); }); }}>
        <Field label={t('name')} htmlFor="finance-new-type" required><input className={inputClassName} id="finance-new-type" name="name" required maxLength={100} disabled={busy} /></Field><Button disabled={busy}>{t('addType')}</Button>
      </form>
      {!data.types.length ? <p>{t('empty')}</p> : data.types.map(type => <form key={type.id} className="flex flex-wrap items-end gap-2 min-w-0 rounded-md border bg-card p-3" onSubmit={e => { e.preventDefault(); void write({ path: `/api/v1/finance/fee-types/${type.id}`, method: 'PATCH', body: { name: String(new FormData(e.currentTarget).get('name')), active: type.active } }); }}>
        <Field label={t('name')} htmlFor={`type-${type.id}`}><input className={inputClassName} id={`type-${type.id}`} name="name" defaultValue={type.name} maxLength={100} required disabled={busy} /></Field>
        <span>{t(type.active ? 'active' : 'inactive')}</span><Button disabled={busy}>{t('save')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void write({ path: `/api/v1/finance/fee-types/${type.id}`, method: 'PATCH', body: { name: type.name, active: !type.active } })}>{t(type.active ? 'deactivate' : 'activate')}</Button>
      </form>)}
      </div>:null}
      {configSection==='structures'?<div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t('structure')}</h2><Button disabled={!year || busy} onClick={() => setEdit(null)}>{t('addStructure')}</Button></div><p className="text-sm text-muted-foreground">{t('structureNotice')}</p>
      {edit !== undefined ? <StructureEditor key={edit?.id ?? `new-${year}`} data={data} year={year} value={edit} busy={busy} t={t} onCancel={() => setEdit(undefined)} onInvalid={() => setMessage('invalid')} onSave={async body => { const ok = await write({ path: edit ? `/api/v1/finance/structures/${edit.id}` : '/api/v1/finance/structures', method: edit ? 'PATCH' : 'POST', body }); if (ok) setEdit(undefined); }} /> : null}
      <div className="grid gap-3 lg:grid-cols-2">{data.structures.map(s => <article key={s.id} className="space-y-2 min-w-0 rounded-lg border bg-card p-4"><h3 className="font-semibold" dir="auto">{data.types.find(f => f.id === s.feeTypeId)?.name}</h3><p>{data.years.find(y => y.id === s.academicYearId)?.name} · {s.levelId ? data.levels.find(l => l.id === s.levelId)?.name : t('schoolWide')}</p><p>{t(s.cadence)} · {money(s.amountCents, s.currency)} · {t(s.active ? 'active' : 'inactive')}</p><ul>{s.periods.map(p => <li key={p.period}><bdi>{p.period === 'once' ? t('once') : p.period}</bdi> · <bdi>{p.dueDate}</bdi></li>)}</ul><Button variant="outline" disabled={busy} onClick={() => setEdit(s)}>{t('edit')}</Button></article>)}</div>{!data.structures.length ? <p>{t('empty')}</p> : null}
      </div>:null}
    </section> : null}
    {tab === 'generation' ? <section className="space-y-4" aria-label={t('generation')}>
      <p>{t('previewNotice')}</p>
      <Field label={t('structure')} htmlFor="finance-structure"><select id="finance-structure" className={inputClassName} value={structureId} disabled={busy} onChange={e => { const s = data.structures.find(v => v.id === e.target.value); setStructureId(e.target.value); setPeriods(s?.periods.map(p => p.period) ?? []); resetPreview(); }}><option value="">{t('select')}</option>{data.structures.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{data.types.find(f => f.id === s.feeTypeId)?.name} · {data.years.find(y => y.id === s.academicYearId)?.name} · {s.levelId ? data.levels.find(l => l.id === s.levelId)?.name : t('schoolWide')} · {money(s.amountCents, s.currency)}</option>)}</select></Field>
      <fieldset className="flex flex-wrap gap-4" disabled={busy}><legend>{t('period')}</legend>{selectedStructure?.periods.map(p => <label key={p.period} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={periods.includes(p.period)} onChange={e => { setPeriods(e.target.checked ? [...periods, p.period] : periods.filter(v => v !== p.period)); resetPreview(); }} /><bdi>{p.period === 'once' ? t('once') : p.period}</bdi> · <bdi>{p.dueDate}</bdi></label>)}</fieldset>
      <Field label={t('selection')} htmlFor="finance-mode"><select className={inputClassName} id="finance-mode" value={mode} disabled={busy} onChange={e => { const v = e.target.value; if (v === 'individual' || v === 'class' || v === 'level') setMode(v); setGroupId(''); resetPreview(); }}>{(['individual', 'class', 'level'] as const).map(v => <option key={v} value={v}>{t(v)}</option>)}</select></Field>
      {mode === 'individual' ? <><Field label={t('search')} htmlFor="finance-search"><input className={inputClassName} id="finance-search" value={search} onChange={e => { setSearch(e.target.value); }} /></Field><p className="text-sm text-muted-foreground">{t('studentLimit')}</p><p>{t('selected')}: {studentIds.length}</p><fieldset disabled={busy} className="grid max-h-72 gap-2 overflow-y-auto min-w-0 rounded-md border bg-card p-3 sm:grid-cols-2"><legend>{t('student')}</legend>{data.students.map(s => <label key={s.id} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={studentIds.includes(s.id)} onChange={e => { setStudentIds(e.target.checked ? [...studentIds, s.id] : studentIds.filter(id => id !== s.id)); resetPreview(); }} /><bdi>{s.firstName} {s.lastName}</bdi></label>)}</fieldset></> : <Field label={t(mode)} htmlFor="finance-group"><select className={inputClassName} id="finance-group" value={groupId} disabled={busy} onChange={e => { setGroupId(e.target.value); resetPreview(); }}><option value="">{t('select')}</option>{(mode === 'class' ? data.classes.filter(c => c.academicYearId === selectedStructure?.academicYearId && c.status === 'ACTIVE') : data.levels.filter(l => l.status === 'ACTIVE')).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>}
      <Button disabled={busy || !structureId || !periods.length || (mode === 'individual' ? !studentIds.length : !groupId)} onClick={() => void preview()}>{t('preview')}</Button>
      {prepared ? <section aria-label={t('preview')} className="space-y-4 min-w-0 rounded-lg border bg-card p-4"><h2 className="text-xl font-semibold">{t('preview')}</h2><p>{t('created')}: {prepared.preview.created} · {t('skipped')}: {prepared.preview.skipped}</p><p className="text-lg font-semibold">{t('total')}: {money(prepared.preview.totalCents)}</p>
        <FinanceTable caption={t('preview')} columns={(['student', 'period', 'dueDate', 'amount', 'status'] as const).map(k => t(k))} rows={prepared.preview.items.slice(previewPage * 50, previewPage * 50 + 50).map(item => ({ id: `${item.studentId}:${item.period}`, cells: [<bdi key="student">{item.studentName}</bdi>, <bdi key="period">{item.period === 'once' ? t('once') : item.period}</bdi>, <bdi key="date">{item.dueDate}</bdi>, money(item.amountCents), t(item.existingChargeId ? 'existing' : 'created')] }))} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || previewPage === 0} onClick={() => setPreviewPage(v => v - 1)}>{t('previous')}</Button><Button variant="outline" disabled={busy || (previewPage + 1) * 50 >= prepared.preview.items.length} onClick={() => setPreviewPage(v => v + 1)}>{t('next')}</Button><Button disabled={busy || !prepared.preview.created} onClick={() => void write({ path: '/api/v1/finance/charges/generate', body: { ...prepared.selection, previewHash: prepared.preview.previewHash, requestKey: prepared.requestKey } }).then(ok => { if (ok) { setPrepared(null); setTab('charges'); } })}>{t('confirm')}</Button></div>
      </section> : null}
    </section> : null}
    {tab === 'charges' ? <section className="space-y-4" aria-label={t('charges')}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t('status')} htmlFor="finance-status"><select id="finance-status" className={inputClassName} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{t('all')}</option><option value="OPEN">{t('OPEN')}</option><option value="CANCELLED">{t('CANCELLED')}</option></select></Field><Field label={t('student')} htmlFor="finance-student-filter"><select id="finance-student-filter" className={inputClassName} value={studentFilter} onChange={e => { setStudentFilter(e.target.value); setPage(1); }}><option value="">{t('all')}</option>{data.students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field></div>
      {!data.charges.length ? <p>{t('empty')}</p> : <div className="grid gap-3 lg:grid-cols-2">{data.charges.map(({ charge: c, studentName }) => <article className="space-y-2 min-w-0 rounded-lg border bg-card p-4" key={c.id}><h2 className="font-semibold" dir="auto">{studentName}</h2><p dir="auto">{c.feeName} · <bdi>{c.period === 'once' ? t('once') : c.period}</bdi> · </p><ChargeStatus {...c} /><p>{t('dueDate')}: <bdi>{c.dueDate}</bdi></p><p className="text-lg font-semibold tabular-nums">{t('outstanding')}: {money(c.status === 'CANCELLED' ? 0 : c.originalCents - c.reductionCents - c.allocatedCents, c.currency)}</p><Button variant="outline" onClick={() => { setDetailId(c.id); adjustmentRequest.current = null; }}>{t('detail')}</Button></article>)}</div>}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{t('previous')}</Button><span>{page} / {Math.max(1, Math.ceil(data.total / 50))}</span><Button variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage(v => v + 1)}>{t('next')}</Button></div>
      {detailId ? <section aria-label={t('detail')} className="space-y-4 min-w-0 rounded-lg border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-semibold">{t('detail')}</h2><Button variant="ghost" onClick={() => setDetailId('')}>{t('close')}</Button></div>
        {detail.isPending ? <p role="status">{t('loading')}</p> : detail.isError ? <div role="alert">{t('error')}<Button onClick={() => void detail.refetch()}>{t('retry')}</Button></div> : charge ? <>
          <p dir="auto">{charge.feeName} · <bdi>{charge.period === 'once' ? t('once') : charge.period}</bdi> · {t(charge.status)}</p><p>{t('original')}: {money(charge.originalCents, charge.currency)} · {t('reduction')}: {money(charge.reductionCents, charge.currency)}</p><p>{t('dueDate')}: <bdi>{charge.dueDate}</bdi></p>
          <p>{paymentT('allocated')}: <bdi>{money(charge.allocatedCents, charge.currency)}</bdi> · {t('outstanding')}: <bdi>{money(charge.status === 'CANCELLED' ? 0 : charge.originalCents - charge.reductionCents - charge.allocatedCents, charge.currency)}</bdi></p>
          <p>{t('cancellationNotice')}</p><form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); try { const value = { kind: adjustKind, reason: String(f.get('reason')), ...(adjustKind === 'REDUCTION' ? { amountCents: parseMoney(String(f.get('amount'))) } : {}) }; const signature = JSON.stringify({ id: detailId, ...value }); if (adjustmentRequest.current?.signature !== signature) adjustmentRequest.current = { signature, key: crypto.randomUUID() }; void write({ path: `/api/v1/finance/charges/${detailId}/adjustments`, body: { ...value, requestKey: adjustmentRequest.current.key } }).then(ok => { if (ok) { form.reset(); adjustmentRequest.current = null; } }); } catch { setMessage('invalid'); } }}>
            <Field label={t('history')} htmlFor="finance-adjustment"><select id="finance-adjustment" className={inputClassName} value={adjustKind} onChange={e => setAdjustKind(e.target.value === 'CANCELLATION' ? 'CANCELLATION' : 'REDUCTION')}><option value="REDUCTION">{t('REDUCTION')}</option><option value="CANCELLATION">{t('CANCELLATION')}</option></select></Field>
            {adjustKind === 'REDUCTION' ? <Field label={t('amount')} htmlFor="finance-reduction" required><input className={inputClassName} id="finance-reduction" name="amount" inputMode="decimal" dir="ltr" required /></Field> : null}
            <Field label={t('reason')} htmlFor="finance-reason" required><textarea className={`${inputClassName} min-h-24`} id="finance-reason" name="reason" maxLength={500} required /></Field>
            <Button variant={adjustKind === 'CANCELLATION' ? 'destructive' : 'default'} disabled={busy || charge.status !== 'OPEN' || (adjustKind === 'CANCELLATION' && !canCancel)}>{t(adjustKind === 'CANCELLATION' ? 'cancelCharge' : 'reduce')}</Button>
          </form>{detail.data ? <ReductionHistory detail={detail.data.data} timezone={timezone} busy={busy || detail.isFetching} onWrite={write} onReload={() => void cache.invalidateQueries({ queryKey: key })} /> : null}
        </> : null}
      </section> : null}
    </section> : null}
  </div>;
}

function StructureEditor({ data, year, value, busy, t, onSave, onCancel, onInvalid }: { data: State; year: string; value: Structure | null; busy: boolean; t: Copy; onSave: (body: unknown) => Promise<void>; onCancel: () => void; onInvalid: () => void }) {
  const academicYearId = value?.academicYearId ?? year; const y = data.years.find(v => v.id === academicYearId);
  const [cadence, setCadence] = useState<'MONTHLY' | 'ONCE'>(value?.cadence ?? 'MONTHLY');
  const [periods, setPeriods] = useState<FeePeriod[]>(value?.periods ?? [{ period: y?.startDate.slice(0, 7) ?? '', dueDate: y?.startDate ?? '' }]);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { const amountCents = parseMoney(String(f.get('amount'))); const common = { amountCents, periods };
      void onSave(value ? { ...common, revision: value.revision, active: f.get('active') === 'on' } : { ...common, academicYearId, feeTypeId: String(f.get('feeType')), levelId: String(f.get('level')) || null, cadence });
    } catch { onInvalid(); }
  }
  return <form onSubmit={submit} className="space-y-4 min-w-0 rounded-lg border bg-card p-4"><h3 className="text-lg font-semibold">{t(value ? 'edit' : 'addStructure')}</h3>
    <fieldset disabled={busy} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">
      {!value ? <><Field label={t('feeType')} htmlFor="structure-type" required><select className={inputClassName} id="structure-type" name="feeType" required><option value="">{t('select')}</option>{data.types.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field><Field label={t('level')} htmlFor="structure-level"><select className={inputClassName} id="structure-level" name="level"><option value="">{t('schoolWide')}</option>{data.levels.filter(v => v.status === 'ACTIVE').map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field></> : null}
      <Field label={t('amount')} htmlFor="structure-amount" required><input id="structure-amount" className={inputClassName} name="amount" inputMode="decimal" dir="ltr" defaultValue={value ? (value.amountCents / 100).toFixed(2) : ''} required /></Field>
      <Field label={t('cadence')} htmlFor="structure-cadence"><select className={inputClassName} id="structure-cadence" value={cadence} disabled={!!value} onChange={e => { const next = e.target.value === 'ONCE' ? 'ONCE' : 'MONTHLY'; setCadence(next); setPeriods([{ period: next === 'ONCE' ? 'once' : y?.startDate.slice(0, 7) ?? '', dueDate: y?.startDate ?? '' }]); }}><option value="MONTHLY">{t('MONTHLY')}</option><option value="ONCE">{t('ONCE')}</option></select></Field>
    </div>{periods.map((p, i) => <div className="grid items-end gap-3 sm:grid-cols-3" key={i}>{cadence === 'MONTHLY' ? <Field label={t('period')} htmlFor={`structure-period-${i}`} required><input className={inputClassName} id={`structure-period-${i}`} type="month" dir="ltr" min={y?.startDate.slice(0, 7)} max={y?.endDate.slice(0, 7)} value={p.period} required onChange={e => setPeriods(periods.map((v, at) => at === i ? { ...v, period: e.target.value } : v))} /></Field> : <p>{t('once')}</p>}<Field label={t('dueDate')} htmlFor={`structure-due-${i}`} required><input className={inputClassName} id={`structure-due-${i}`} type="date" dir="ltr" min={y?.startDate} max={y?.endDate} value={p.dueDate} required onChange={e => setPeriods(periods.map((v, at) => at === i ? { ...v, dueDate: e.target.value } : v))} /></Field>{cadence === 'MONTHLY' ? <Button type="button" variant="outline" disabled={periods.length <= 1} onClick={() => setPeriods(periods.filter((_, at) => at !== i))}>{t('remove')}</Button> : null}</div>)}
      {cadence === 'MONTHLY' ? <Button type="button" variant="outline" disabled={periods.length >= 36} onClick={() => setPeriods([...periods, { period: '', dueDate: '' }])}>{t('addPeriod')}</Button> : null}
      {value ? <label className="flex min-h-10 items-center gap-2"><input name="active" type="checkbox" defaultChecked={value.active} />{t('active')}</label> : null}
      <div className="flex flex-wrap gap-2"><Button>{t('save')}</Button><Button variant="outline" type="button" onClick={onCancel}>{t('cancel')}</Button></div>
    </fieldset>
  </form>;
}
