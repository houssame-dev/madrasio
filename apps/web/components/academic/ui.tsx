'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@school/shared';
import { Button } from '@school/ui';
import { useTranslations } from 'next-intl';
import { useAcademicCopy } from '@/i18n/use-domain-copy';

export const inputClassName = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';
export const selectClassName = inputClassName;

export function ManagementPageHeader({ readOnly, title, description }: { readOnly: boolean; title?:string; description?:string }) {
  const t = useAcademicCopy();
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title ?? t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description ?? t.description}</p>
      </div>
      {readOnly ? <div className="rounded-md border bg-muted px-3 py-2 text-sm"><span className="font-medium">{t.readOnly}</span><span className="sr-only">. {t.readOnlyDescription}</span></div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>{action}</div>;
}

export function StatusBadge({ status, label = status, brand = false }: { status: string; label?: string; brand?: boolean }) {
  const positive = status === 'ACTIVE';
  const quiet = ['ARCHIVED', 'CLOSED', 'INACTIVE'].includes(status);
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', !brand && positive && 'border-emerald-200 bg-emerald-50 text-emerald-800', !brand && (status === 'PLANNED' || status === 'DRAFT') ? 'border-blue-200 bg-blue-50 text-blue-800' : '', quiet && 'bg-muted text-muted-foreground', brand && !quiet && (positive ? 'border-accent/50 bg-accent/15 text-foreground' : 'bg-muted text-foreground'))}>{label}</span>;
}

type TableElementProps = { children?: ReactNode; className?: string; colSpan?: number; role?: string };

export function TableShell({ headers, children, loading, responsive = false }: { headers: readonly string[]; children: ReactNode; loading?: boolean; responsive?: boolean }) {
  const loadingText = useTranslations('academic');
  const rows = loading ? Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden="true">{headers.map(header => <td key={header} className="px-4 py-4"><span className="block h-4 animate-pulse rounded bg-muted" /></td>)}</tr>) : children;
  // Preserve each original control/handler; only add mobile labels to native cells.
  const content = responsive ? Children.map(rows, row => {
    if (!isValidElement<TableElementProps>(row) || row.type !== 'tr') return row;
    return cloneElement(row, { role: 'row' }, Children.map(row.props.children, (cell, index) => {
      if (!isValidElement<TableElementProps>(cell) || (cell.type !== 'td' && cell.type !== 'th')) return cell;
      return cloneElement(cell, { role: cell.type === 'th' ? 'rowheader' : 'cell', className: cn(cell.props.className, 'min-w-0 break-words text-start [&>div]:flex-wrap [&>div]:justify-start xl:[&>div]:justify-end') }, <>{!loading && !cell.props.colSpan ? <span aria-hidden="true" className="mb-1 block text-xs font-medium text-muted-foreground xl:hidden">{headers[index]}</span> : null}{cell.props.children}</>);
    }));
  }) : rows;
  return <div className={cn('rounded-lg', responsive ? 'min-w-0' : 'overflow-x-auto border bg-card')} aria-busy={loading || undefined}>
    {loading ? <span role="status" className="sr-only">{loadingText('loading')}</span> : null}
    <table role="table" className={cn('w-full text-sm', responsive ? 'block xl:table [&_tbody_tr]:grid [&_tbody_tr]:min-w-0 [&_tbody_tr]:rounded-lg [&_tbody_tr]:border [&_tbody_tr]:bg-card sm:[&_tbody_tr]:grid-cols-2 xl:[&_tbody_tr]:table-row xl:[&_tbody_tr]:border-0' : 'min-w-[42rem]')}>
      <thead role="rowgroup" className={cn('border-b bg-muted/60 text-start text-xs text-muted-foreground', responsive ? 'sr-only xl:not-sr-only xl:table-header-group' : 'uppercase tracking-wide')}><tr role="row">{headers.map(header => <th key={header} scope="col" className="px-4 py-3 text-start font-medium">{header}</th>)}</tr></thead>
      <tbody role="rowgroup" className={responsive ? 'grid gap-3 xl:table-row-group xl:divide-y' : 'divide-y'}>{content}</tbody>
    </table>
  </div>;
}

export function ManagementGuide({ area }: { area: 'years' | 'structure' | 'tracks' | 'subjects' | 'curricula' | 'classes' | 'students' | 'teachers' | 'parents' }) {
  const t = useTranslations('managementUi');
  return <p className="rounded-lg border bg-card p-4 text-sm leading-relaxed text-muted-foreground">{t(area)}</p>;
}

export function EmptyTableRow({ columns }: { columns: number }) {
  const common = useTranslations('collection');
  return <tr role="row"><td role="cell" dir="auto" colSpan={columns} className="px-4 py-10 text-center"><p className="font-medium">{common('empty')}</p><p className="mt-1 text-sm text-muted-foreground">{common('emptyDescription')}</p></td></tr>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const common = useTranslations('collection');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label={common('pagination')} className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{common('pageSummary', { page, pages, total })}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{common('previous')}</Button><Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{common('next')}</Button></div></nav>;
}

export function InlineFeedback({ kind, children, brand = false }: { kind: 'success' | 'error' | 'warning'; children: ReactNode; brand?: boolean }) {
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return <div role={kind === 'error' ? 'alert' : 'status'} aria-atomic="true" className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', brand && kind !== 'error' ? 'border-accent/40 bg-accent/10 text-foreground' : kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : kind === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-destructive/30 bg-destructive/5 text-destructive')}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{children}</div>;
}

export function Field({ label, htmlFor, error, hint, required, children }: { label: string; htmlFor: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  // Clone only the labelled native control, preserving its RHF ref and handlers.
  const controls = Children.map(children, (child) => {
    if (!isValidElement<HTMLAttributes<HTMLElement> & { required?: boolean }>(child) || child.props.id !== htmlFor) return child;
    const describedBy = [...new Set([child.props['aria-describedby'], hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ').split(' ').filter(Boolean))].join(' ');
    return cloneElement(child, {
      'aria-invalid': error ? true : child.props['aria-invalid'],
      'aria-describedby': describedBy || undefined,
      'aria-required': required || child.props.required || child.props['aria-required'],
    });
  });
  return <div className="min-w-0 space-y-1.5"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{controls}{hint ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}{error ? <p id={errorId} className="text-xs text-destructive">{error}</p> : null}</div>;
}

// Nested dialogs share the page scroll lock; restore the original style only after the last closes.
const modalScrollLocks = new WeakMap<HTMLElement, { count: number; overflow: string }>();

export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const actions = useTranslations('foundation.actions');
  const modalId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const lock = modalScrollLocks.get(body) ?? { count: 0, overflow: body.style.overflow };
    lock.count += 1;
    modalScrollLocks.set(body, lock);
    body.style.overflow = 'hidden';
    const isTopDialog = () => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === panel;
    };
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])')).filter(element =>
      (!element.hasAttribute('tabindex') || element.tabIndex >= 0) && !element.matches(':disabled') && element.closest('[role="dialog"][aria-modal="true"]') === panel && !element.closest('[hidden], [inert]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden',
    );
    const focusFirst = () => (focusables()[0] ?? panel).focus();
    if (isTopDialog()) focusFirst();
    const onFocusIn = (event: FocusEvent) => {
      if (isTopDialog() && event.target instanceof Node && !panel.contains(event.target)) focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); }
      if (event.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) { event.preventDefault(); panel.focus(); return; }
        const first = items[0]; const last = items[items.length - 1];
        if (!panel.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      lock.count -= 1;
      if (lock.count === 0) { body.style.overflow = lock.overflow; modalScrollLocks.delete(body); }
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center p-4"><button type="button" tabIndex={-1} className="absolute inset-0 bg-foreground/40" aria-label={actions('cancel')} onClick={onClose} /><div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${modalId}-title`} aria-describedby={description ? `${modalId}-description` : undefined} className="relative z-10 max-h-[90dvh] w-full min-w-0 max-w-xl overflow-y-auto overscroll-contain rounded-lg border bg-background shadow-xl"><div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5"><div><h2 id={`${modalId}-title`} className="text-lg font-semibold">{title}</h2>{description ? <p id={`${modalId}-description`} className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div><Button type="button" variant="ghost" size="icon" aria-label={actions('cancel')} onClick={onClose}><X className="size-4" aria-hidden="true" /></Button></div><div className="min-w-0 p-4 sm:p-5">{children}</div></div></div>;
}

export function FormActions({ pending, onCancel, submitLabel }: { pending: boolean; onCancel: () => void; submitLabel?: string }) {
  const actions = useTranslations('foundation.actions');
  return <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onCancel}>{actions('cancel')}</Button><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{submitLabel ?? actions('save')}</Button></div>;
}

export function ConfirmDialog({ open, title, description, pending, error, onClose, onConfirm }: { open: boolean; title: string; description: string; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  const actions = useTranslations('foundation.actions');
  const common = useTranslations('collection');
  return <Modal open={open} title={title} description={description} onClose={onClose}><div className="space-y-4">{error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{actions('cancel')}</Button><Button type="button" disabled={pending} onClick={onConfirm}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{common('confirm')}</Button></div></div></Modal>;
}
