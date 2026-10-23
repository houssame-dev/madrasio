'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppContext } from '@/components/app/app-context';
import { visibleNavigationItems } from '@/lib/frontend/navigation';

const groups = {
  school: [
    { title: 'schoolDay', paths: ['/students', '/teachers', '/attendance'] },
    { title: 'planning', paths: ['/academic', '/timetable', '/finance'] },
    { title: 'stayConnected', paths: ['/announcements', '/notifications'] },
  ],
  teaching: [{ title: 'dailyTasks', paths: ['/attendance', '/timetable', '/homework', '/grades'] }],
  family: [{ title: 'stayConnected', paths: ['/timetable', '/announcements/inbox', '/notifications'] }],
} as const;

const descriptions = {
  '/students': 'students', '/teachers': 'teachers', '/attendance': 'attendance',
  '/academic': 'academic', '/timetable': 'timetable', '/finance': 'finance',
  '/announcements': 'announcements', '/announcements/inbox': 'schoolAnnouncements',
  '/notifications': 'notifications', '/homework': 'homework', '/grades': 'grades',
} as const;

/** Shortcuts reuse the navigation permission matrix; they never grant a new scope. */
export function DashboardActions({ workflows }: { workflows: keyof typeof groups }) {
  const context = useAppContext();
  const t = useTranslations('dashboardUi');
  const labels = useTranslations('navigation.items');
  if (!context.currentSchool) return null;
  const allowed = visibleNavigationItems(context.currentSchool.role);
  return <>{groups[workflows].map(group => {
    const items = group.paths.flatMap(path => {
      const item = allowed.find(item => item.href === path);
      return item ? [{ ...item, description: descriptions[path] }] : [];
    });
    return items.length ? <section key={group.title} aria-label={t(group.title)} className="space-y-3">
      <h2 className="text-xl font-semibold">{t(group.title)}</h2>
      <ul className={workflows === 'teaching' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'}>
        {items.map(({ href, labelKey, icon: Icon, description }) => <li key={href} className="min-w-0">
          <Link href={href} className="group flex h-full min-h-28 gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words"><span className="font-semibold">{labels(labelKey)}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{t(description)}</span></span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </section> : null;
  })}</>;
}
