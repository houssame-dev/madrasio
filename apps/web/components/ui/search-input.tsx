'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@school/ui';
import { inputClassName } from '@/components/academic/ui';
import { managementCopy as t } from '@/lib/frontend/management-copy';

/** URL/query state stays with the consumer. Local complete lists use mode="local". */
export function SearchInput({ id, label, value = '', onSearch, busy = false, mode = 'server' }: {
  id: string; label: string; value?: string; onSearch: (value?: string) => void;
  busy?: boolean; mode?: 'server' | 'local';
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callback = useRef(onSearch);
  callback.current = onSearch;
  useEffect(() => { clearTimeout(timer.current); setDraft(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const publish = (raw: string) => {
    clearTimeout(timer.current);
    const next = raw.trim();
    if (next !== value) callback.current(next || undefined);
  };
  return <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="search" aria-label={label} onSubmit={(event) => { event.preventDefault(); publish(draft); }}>
    <label className="sr-only" htmlFor={id}>{label}</label>
    <input id={id} type="search" maxLength={100} className={`${inputClassName} min-w-0 flex-1`} value={draft} placeholder={label} onChange={(event) => {
      const raw = event.target.value;
      setDraft(raw);
      clearTimeout(timer.current);
      if (!raw.trim() || mode === 'local') publish(raw);
      else timer.current = setTimeout(() => publish(raw), 350);
    }} />
    <Button type="submit" variant="outline">{t.search}</Button>
    {draft || value ? <Button type="button" variant="ghost" onClick={() => { setDraft(''); publish(''); }}>{t.clear}</Button> : null}
    {/* Deliberately not a live region: do not announce each search keystroke. */}
    {busy ? <span className="text-xs text-muted-foreground">{t.searching}</span> : null}
  </form>;
}
