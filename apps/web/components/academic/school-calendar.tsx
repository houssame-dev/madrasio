'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import { apiRequest, ApiClientError } from '@/lib/frontend/api-client';
import { academicApi } from '@/lib/frontend/academic/api';
import { NativeSelect } from '@/components/ui/native-select';
import { Field, inputClassName, Modal } from './ui';
import { createHolidaySchema, type HolidayView } from '@/lib/modules/school-holidays/contracts';
import './school-calendar.css';
type Page = { data: HolidayView[]; meta: { page: number; pageSize: number; total: number } };
type Form = { name: string; type: HolidayView['type']; startDate: string; endDate: string; description: string };
const blank: Form = { name: '', type: 'SCHOOL_HOLIDAY', startDate: '', endDate: '', description: '' };

export function SchoolCalendar({ schoolId }: { schoolId: string }) {
  const t = useTranslations('schoolHolidays'), cache = useQueryClient();
  const [search, setSearch] = useState(''), [type, setType] = useState(''), [year, setYear] = useState(''), [page, setPage] = useState(1);
  const [editing, setEditing] = useState<HolidayView | null | undefined>(), [removing, setRemoving] = useState<HolidayView | null>(null);
  const [form, setForm] = useState<Form>(blank), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'invalid' | 'conflict' | 'stale' | 'failed' | null>(null);
  const params = new URLSearchParams({ search, page: String(page), ...(type ? { type } : {}), ...(year ? { academicYearId: year } : {}) });
  const key = ['school-holidays', schoolId];
  const list = useQuery({ queryKey: [...key, search, type, year, page], queryFn: () => apiRequest<Page>(`/api/v1/school-holidays?${params}`), retry: false });
  const years = useQuery({ queryKey: [...key, 'years'], queryFn: () => academicApi.allYears(), retry: false });
  useEffect(() => { if (!dirty) return; const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent); }, [dirty]);
  function open(value: HolidayView | null) { setEditing(value); setForm(value ? { name: value.name, type: value.type, startDate: value.startDate, endDate: value.endDate, description: value.description ?? '' } : blank); setDirty(false); setFeedback(null); }
  function close() { if (!busy && (!dirty || window.confirm(t('discard')))) { setEditing(undefined); setDirty(false); setFeedback(null); } }
  function patch(values: Partial<Form>) { setForm(f => ({ ...f, ...values })); setDirty(true); setFeedback(null); }
  async function save(remove = false) {
    if (busy) return;
    if (!remove && !createHolidaySchema.safeParse(form).success) { setFeedback('invalid'); return; }
    const old = remove ? removing : editing;
    setBusy(true); setFeedback(null);
    try {
      await apiRequest(`/api/v1/school-holidays${old ? `/${old.id}` : ''}`, {
        method: remove ? 'DELETE' : old ? 'PATCH' : 'POST',
        body: JSON.stringify(remove ? { expectedRevision: old!.revision, confirmed: true } : { ...form, ...(old ? { expectedRevision: old.revision } : {}) }),
      });
      setEditing(undefined); setRemoving(null); setDirty(false); setFeedback('saved');
      // Clear every dated consumer without dropping another School's cache namespace.
      for (const prefix of ['school-holidays', 'timetable-published', 'attendance', 'admin-dashboard', 'teacher-workspace', 'parent-dashboard-timetable']) await cache.invalidateQueries({ predicate: q => q.queryKey[0] === prefix && q.queryKey.includes(schoolId) });
    } catch (e) {
      setFeedback(e instanceof ApiClientError && e.featureCode === 'HOLIDAY_ATTENDANCE_CONFLICT' ? 'conflict' : e instanceof ApiClientError && e.status === 409 ? 'stale' : 'failed');
    } finally { setBusy(false); }
  }
  const message = feedback ? <p role={feedback === 'saved' ? 'status' : 'alert'} className={`rounded-md border p-3 text-sm leading-relaxed ${feedback === 'saved' ? 'bg-muted' : 'border-destructive/40 text-destructive'}`}>{t(feedback)}</p> : null;
  const pages = Math.max(1, Math.ceil((list.data?.meta.total ?? 0) / 20));
  return <section className="school-calendar" aria-label={t('calendar')} aria-busy={busy}>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{t('title')}</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('intro')}</p></div><Button onClick={() => open(null)}><Plus className="size-4" aria-hidden="true" />{t('add')}</Button></header>
    <div className="holiday-filters"><Field label={t('search')} htmlFor="holiday-search"><input type="search" id="holiday-search" className={inputClassName} maxLength={160} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></Field>
      <Field label={t('type')} htmlFor="holiday-type-filter"><NativeSelect id="holiday-type-filter" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">{t('allTypes')}</option>{(['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY'] as const).map(v => <option key={v} value={v}>{t(v)}</option>)}</NativeSelect></Field>
      <Field label={t('year')} htmlFor="holiday-year-filter"><NativeSelect id="holiday-year-filter" disabled={!years.isSuccess} value={year} onChange={e => { setYear(e.target.value); setPage(1); }}><option value="">{t('allYears')}</option>{years.data?.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</NativeSelect></Field></div>
    {years.isError ? <p role="alert">{t('error')} <Button variant="outline" onClick={() => void years.refetch()}>{t('retry')}</Button></p> : null}
    {editing === undefined && !removing ? message : null}
    {list.isPending ? <p role="status">{t('loading')}</p> : list.isError ? <div role="alert">{t('error')} <Button variant="outline" onClick={() => void list.refetch()}>{t('retry')}</Button></div> : !list.data.data.length ? <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('empty')}</p> : <div className="holiday-table"><table><thead><tr>{(['name', 'dates', 'type', 'description', 'actions'] as const).map(k => <th key={k} scope="col">{t(k)}</th>)}</tr></thead><tbody>{list.data.data.map(h => <tr key={h.id}><td data-label={t('name')}><strong><bdi>{h.name}</bdi></strong></td><td data-label={t('dates')}><bdi dir="ltr">{h.startDate}{h.endDate !== h.startDate ? ` – ${h.endDate}` : ''}</bdi></td><td data-label={t('type')}><span className="holiday-type" data-type={h.type}>{t(h.type)}</span></td><td data-label={t('description')}><bdi>{h.description || '—'}</bdi></td><td data-label={t('actions')}><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={`${t('edit')} ${h.name}`} onClick={() => open(h)}><Pencil className="size-4" aria-hidden="true" /></Button><Button variant="outline" size="icon" aria-label={`${t('remove')} ${h.name}`} onClick={() => { setRemoving(h); setFeedback(null); }}><Trash2 className="size-4 text-destructive" aria-hidden="true" /></Button></div></td></tr>)}</tbody></table></div>}
    <footer className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t('page', { page, pages })}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || list.isFetching} onClick={() => setPage(v => v - 1)}>{t('previous')}</Button><Button variant="outline" disabled={page >= pages || list.isFetching} onClick={() => setPage(v => v + 1)}>{t('next')}</Button></div></footer>
    <p className="rounded-lg border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">{t('notice')}</p>
    <Modal open={editing !== undefined} title={t(editing ? 'edit' : 'add')} onClose={close}>
      <form className="holiday-form" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
        <Field label={t('name')} htmlFor="holiday-name" required><input autoFocus id="holiday-name" className={inputClassName} required maxLength={160} value={form.name} disabled={busy} onChange={e => patch({ name: e.target.value })} /></Field>
        <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm font-medium">{t('type')}</legend><div className="holiday-types">{(['PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY'] as const).map(v => <label key={v} className="holiday-choice"><input type="radio" name="holiday-type" value={v} checked={form.type === v} onChange={() => patch({ type: v })} /><span><strong>{t(v)}</strong><small>{t(v === 'PUBLIC_HOLIDAY' ? 'publicHint' : 'schoolHint')}</small></span></label>)}</div></fieldset>
        <div className="holiday-dates"><Field label={t('start')} htmlFor="holiday-start" required><input type="date" id="holiday-start" dir="ltr" className={inputClassName} required value={form.startDate} disabled={busy} onChange={e => patch({ startDate: e.target.value })} /></Field><Field label={t('end')} htmlFor="holiday-end" required><input type="date" id="holiday-end" dir="ltr" className={inputClassName} min={form.startDate || undefined} required value={form.endDate} disabled={busy} onChange={e => patch({ endDate: e.target.value })} /></Field></div>
        <Field label={t('description')} htmlFor="holiday-description"><textarea id="holiday-description" className={`${inputClassName} min-h-24`} maxLength={2000} value={form.description} disabled={busy} onChange={e => patch({ description: e.target.value })} /></Field>
        {message}<div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={close}>{t('cancel')}</Button><Button disabled={busy}>{t(busy ? 'saving' : editing ? 'saveChanges' : 'save')}</Button></div>
      </form>
    </Modal>
    <Modal open={!!removing} title={t('remove')} onClose={() => { if (!busy) { setRemoving(null); setFeedback(null); } }}><div className="space-y-4"><CalendarDays className="size-8 text-destructive" aria-hidden="true" /><p className="text-sm leading-relaxed">{t('deleteHint')}</p><div className="rounded-lg border bg-muted p-3"><strong><bdi>{removing?.name}</bdi></strong><p className="mt-1 text-sm"><bdi dir="ltr">{removing?.startDate} – {removing?.endDate}</bdi></p></div>{message}<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>{t('cancel')}</Button><Button variant="destructive" disabled={busy} onClick={() => void save(true)}>{t(busy ? 'saving' : 'remove')}</Button></div></div></Modal>
  </section>;
}
