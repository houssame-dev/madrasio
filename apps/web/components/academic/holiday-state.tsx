'use client';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HolidayView } from '@/lib/modules/school-holidays/contracts';

export function HolidayState({ holidays, attendance = false }: { holidays: HolidayView[]; attendance?: boolean }) {
  const t = useTranslations('schoolHolidays');
  if (!holidays.length) return null;
  return <section className="holiday-closure rounded-xl border bg-muted p-6 text-center" role="status">
    <CalendarDays className="mx-auto mb-4 size-8 text-primary" aria-hidden="true" />
    <h2 className="text-xl font-semibold">{t(attendance ? 'noAttendance' : 'noClasses')}</h2>
    <ul className="my-4 space-y-2">{holidays.map(h => <li key={h.id}><strong><bdi>{h.name}</bdi></strong><span className="ms-2 inline-block rounded-md border px-2 py-1 text-xs">{t(h.type)}</span></li>)}</ul>
    <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">{t(attendance ? 'closed' : 'unchanged')}</p>
  </section>;
}
