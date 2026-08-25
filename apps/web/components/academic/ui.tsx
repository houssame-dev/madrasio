'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@school/shared';
import { Button } from '@school/ui';
import { academicCopy as t } from '@/lib/frontend/academic/copy';

export const inputClassName = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';
export const selectClassName = inputClassName;

export function ManagementPageHeader({ readOnly }: { readOnly: boolean }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </div>
      {readOnly ? <div className="rounded-md border bg-muted px-3 py-2 text-sm"><span className="font-medium">{t.readOnly}</span><span className="sr-only">. {t.readOnlyDescription}</span></div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{action}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const positive = status === 'ACTIVE';
  const quiet = ['ARCHIVED', 'CLOSED', 'INACTIVE'].includes(status);
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', positive && 'border-emerald-200 bg-emerald-50 text-emerald-800', status === 'PLANNED' || status === 'DRAFT' ? 'border-blue-200 bg-blue-50 text-blue-800' : '', quiet && 'bg-muted text-muted-foreground')}>{status}</span>;
}

export function TableShell({ headers, children, loading }: { headers: readonly string[]; children: ReactNode; loading?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="border-b bg-muted/60 text-start text-xs uppercase tracking-wide text-muted-foreground"><tr>{headers.map((header) => <th key={header} scope="col" className="px-4 py-3 text-start font-medium">{header}</th>)}</tr></thead>
        <tbody className="divide-y">{loading ? Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden="true">{headers.map((header) => <td key={header} className="px-4 py-4"><span className="block h-4 animate-pulse rounded bg-muted" /></td>)}</tr>) : children}</tbody>
      </table>
    </div>
  );
}

export function EmptyTableRow({ columns }: { columns: number }) {
  return <tr><td colSpan={columns} className="px-4 py-10 text-center"><p className="font-medium">{t.noRecords}</p><p className="mt-1 text-sm text-muted-foreground">{t.noRecordsDescription}</p></td></tr>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label={t.pagination} className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t.page} {page} / {pages} · {total}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t.previous}</Button><Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t.next}</Button></div></nav>;
}

export function InlineFeedback({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-destructive/30 bg-destructive/5 text-destructive')}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{children}</div>;
}

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  const errorId = `${htmlFor}-error`;
  return <div className="space-y-1.5"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}{error ? <p id={errorId} className="text-xs text-destructive" role="alert">{error}</p> : null}</div>;
}

export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]') ?? []);
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); triggerRef.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center p-4"><button type="button" className="absolute inset-0 bg-foreground/40" aria-label={t.cancel} onClick={onClose} /><div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="academic-modal-title" aria-describedby={description ? 'academic-modal-description' : undefined} className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background shadow-xl"><div className="flex items-start justify-between gap-4 border-b p-5"><div><h2 id="academic-modal-title" className="text-lg font-semibold">{title}</h2>{description ? <p id="academic-modal-description" className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div><Button type="button" variant="ghost" size="icon" aria-label={t.cancel} onClick={onClose}><X className="size-4" aria-hidden="true" /></Button></div><div className="p-5">{children}</div></div></div>;
}

export function FormActions({ pending, onCancel, submitLabel = t.save }: { pending: boolean; onCancel: () => void; submitLabel?: string }) {
  return <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{submitLabel}</Button></div>;
}

export function ConfirmDialog({ open, title, description, pending, error, onClose, onConfirm }: { open: boolean; title: string; description: string; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal open={open} title={title} description={description} onClose={onClose}><div className="space-y-4">{error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="button" disabled={pending} onClick={onConfirm}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{t.confirmAction}</Button></div></div></Modal>;
}
