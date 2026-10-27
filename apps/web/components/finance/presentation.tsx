'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** One semantic table and one set of controls at every viewport size. */
export function FinanceTable({ caption, columns, rows }: {
  caption: string;
  columns: string[];
  rows: { id: string; cells: ReactNode[] }[];
}) {
  return <div className="finance-table-scroll min-w-0 overflow-x-auto" role="group" tabIndex={0} aria-label={caption}><table role="table" className="finance-data-table block w-full text-sm xl:table print:table">
    <caption className="sr-only">{caption}</caption>
    <thead role="rowgroup" className="sr-only xl:not-sr-only xl:table-header-group print:not-sr-only print:table-header-group"><tr role="row">{columns.map((label, i) => <th key={i} scope="col" className="p-3 text-start text-muted-foreground">{label}</th>)}</tr></thead>
    <tbody role="rowgroup" className="grid gap-3 xl:table-row-group print:table-row-group">{rows.map(row => <tr role="row" key={row.id} className="grid min-w-0 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 xl:table-row xl:border-0 xl:p-0 print:table-row print:border-0 print:p-0">{row.cells.map((cell, i) => <td role="cell" key={i} className="min-w-0 break-words xl:border-b xl:p-3 xl:align-top print:p-2"><span aria-hidden="true" className="finance-cell-label mb-1 block text-xs font-medium text-muted-foreground xl:hidden print:hidden">{columns[i]}</span>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function ChargeStatus({ status, originalCents, reductionCents, allocatedCents }: {
  status: string; originalCents: number; reductionCents: number; allocatedCents: number;
}) {
  const t = useTranslations('financeReports'), c = useTranslations('finance');
  const remaining = originalCents - reductionCents - allocatedCents;
  const label = status === 'CANCELLED' ? c('CANCELLED') : t(remaining === 0 ? 'paidStatus' : allocatedCents > 0 ? 'partialStatus' : 'unpaidStatus');
  return <span className={`inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-semibold ${status !== 'CANCELLED' && remaining > 0 ? 'border-accent/50 bg-accent/15 text-foreground' : 'bg-muted text-foreground'}`}>{label}</span>;
}
