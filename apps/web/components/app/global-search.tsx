'use client';

import { Dialog } from '@base-ui/react/dialog';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { ArrowDown, ArrowUp, ChevronRight, Search, School, Users, UserRound, X, AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@school/ui';
import { visibleNavigationItems } from '@/lib/frontend/navigation';
import { apiRequest } from '@/lib/frontend/api-client';
import { searchCategories, type SearchCategory, type SearchResponse, type SearchRecord } from '@/lib/modules/search/contracts';
import type { MeResponseDto } from '@/lib/api/me';
import './global-search.css';

type Item = { id: string; name: string; detail: string | null; href: string; category: SearchCategory; icon?: typeof Search };
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function GlobalSearch({ context }: { context: MeResponseDto }) {
  const t = useTranslations('globalSearch'), nav = useTranslations('navigation.items'), locale = useLocale();
  const router = useRouter(), pathname = usePathname(), current = context.currentSchool!;
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [category, setCategory] = useState<SearchCategory>('all');
  const [active, setActive] = useState(0), [retry, setRetry] = useState(0), [mac, setMac] = useState(false);
  const [response, setResponse] = useState<{ key: string; rows: SearchRecord[]; status: 'ready' | 'error' }>();
  const trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null);
  const listId = useId(), categories = searchCategories(current.role), term = query.trim();
  const key = JSON.stringify([context.user.id, current.id, current.role, locale, term, category]);
  function changeOpen(value: boolean) { setOpen(value); if (!value) { setQuery(''); setCategory('all'); setActive(0); setResponse(undefined); } }
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k' || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]') && !panel.current?.contains(target)) return;
      if (!open && document.querySelector('[role="dialog"]')) return;
      event.preventDefault(); setOpen(true); input.current?.focus();
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [open]);
  useEffect(() => { changeOpen(false); }, [pathname]);
  const eligible = open && term.length >= 2 && term.length <= 80 && category !== 'pages' && categories.length > 0;
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController(); let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const value = await apiRequest<SearchResponse>(`/api/v1/search?${new URLSearchParams({ q: term, category })}`, { signal: controller.signal, cache: 'no-store' });
        if (!live) return;
        if (value.scope.userId !== context.user.id || value.scope.schoolId !== current.id || value.scope.role !== current.role || !Array.isArray(value.data) || value.data.length > 24) throw new Error('Search scope changed');
        setResponse({ key, rows: value.data, status: 'ready' }); setActive(0);
      } catch { if (live) setResponse({ key, rows: [], status: 'error' }); }
    }, 325);
    return () => { live = false; controller.abort(); window.clearTimeout(timer); };
  }, [eligible, term, category, key, retry, context.user.id, current.id, current.role]);
  const pages: Item[] = (category === 'all' || category === 'pages') ? visibleNavigationItems(current.role).map(item => ({ id: item.href, name: nav(item.labelKey), detail: t('destination'), href: item.href, category: 'pages' as const, icon: item.icon })).filter(item => !term || fold(item.name).includes(fold(term))) : [];
  const records = eligible && response?.key === key ? response.rows : [];
  const groups = [pages.length ? { category: 'pages' as const, label: t(term ? 'pages' : 'quick'), items: pages } : null, ...categories.map(value => ({ category: value, label: t(value), items: records.filter(row => row.category === value) as Item[] }))].filter((group): group is NonNullable<typeof group> => !!group && group.items.length > 0);
  const items = groups.flatMap(group => group.items);
  const loading = eligible && response?.key !== key, error = eligible && response?.key === key && response.status === 'error';
  const selected = Math.min(active, Math.max(0, items.length - 1));
  function pick(item: Item) { changeOpen(false); router.push(item.href); }
  useEffect(() => { if (open) document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest' }); }, [selected, listId, open]);
  return <DirectionProvider direction={locale === 'ar' ? 'rtl' : 'ltr'}><Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger ref={trigger} className="global-search-trigger" aria-label={t('open')} aria-keyshortcuts="Control+k Meta+k"><Search className="size-[1.125rem] shrink-0" aria-hidden="true" /><span>{t('placeholder')}</span><kbd>{mac ? '⌘K' : 'Ctrl+K'}</kbd></Dialog.Trigger>
    <Dialog.Portal><Dialog.Backdrop className="global-search-backdrop" /><Dialog.Popup ref={panel} initialFocus={input} finalFocus={trigger} className="madrasio-workspace global-search-popup" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Dialog.Title className="sr-only">{t('title')}</Dialog.Title><Dialog.Description className="sr-only">{t('privacy')}</Dialog.Description>
      <div className="global-search-input"><Search className="size-5 shrink-0" aria-hidden="true" /><input ref={input} type="search" role="combobox" aria-label={t('title')} aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={items.length ? `${listId}-${selected}` : undefined} placeholder={t('placeholder')} maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(value => items.length ? (value + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length : 0); }
        if (event.key === 'Enter') { event.preventDefault(); if (items[selected]) pick(items[selected]); }
      }} /><Dialog.Close className="global-search-close" aria-label={t('close')}><X className="size-5" aria-hidden="true" /></Dialog.Close></div>
      <div className="global-search-filters" role="group" aria-label={t('filters')}>{(['all', 'pages', ...categories] as SearchCategory[]).map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setActive(0); input.current?.focus(); }} className="global-search-filter">{t(value)}</button>)}</div>
      <div className="global-search-results" data-empty={!groups.length || undefined}>
      <div id={listId} role="listbox" aria-label={t('title')} aria-busy={loading}>
        {groups.map(group => <div role="group" aria-label={group.label} key={group.category}><h2 className="global-search-group" aria-hidden="true">{group.label}<span>{group.items.length}</span></h2>{group.items.map(item => {
          const index = items.indexOf(item), Icon = item.icon ?? (item.category === 'classes' ? School : item.category === 'parents' ? Users : UserRound);
          return <div key={item.category + item.id} id={`${listId}-${index}`} role="option" aria-selected={selected === index} onMouseMove={() => setActive(index)} onClick={() => pick(item)} className="global-search-option"><span className="global-search-icon"><Icon className="size-[1.125rem]" aria-hidden="true" /></span><div><strong><bdi>{item.name}</bdi></strong><p><bdi>{item.detail ?? t(item.category)}</bdi></p></div><ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" /></div>;
        })}</div>)}
      </div>
      {!loading && !error && !items.length ? <div className="global-search-state"><Search aria-hidden="true" /><strong>{t('empty')}</strong><p>{t('emptyHint')}</p></div> : null}
      {loading ? <div className="global-search-state" role="status"><Search aria-hidden="true" /><strong>{t('loading')}</strong><p>{t('privacy')}</p></div> : null}
      {error ? <div className="global-search-state" role="alert"><AlertTriangle aria-hidden="true" /><strong>{t('error')}</strong><p>{t('errorHint')}</p><Button variant="outline" size="sm" onClick={() => { setResponse(undefined); setRetry(value => value + 1); input.current?.focus(); }}>{t('retry')}</Button></div> : null}
      </div>
      {!eligible && category !== 'pages' ? <p className="global-search-minimum">{t('minimum')}</p> : null}
      <footer className="global-search-footer"><span>{t('privacy')}</span><span><kbd><ArrowUp aria-label={t('navigate')} /></kbd><kbd><ArrowDown aria-label={t('navigate')} /></kbd><span>{t('navigate')}</span><kbd>Enter</kbd><span>{t('activate')}</span><kbd>Esc</kbd><span>{t('dismiss')}</span></span></footer>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root></DirectionProvider>;
}
