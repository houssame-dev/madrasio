'use client';
import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Bell, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap, Megaphone, RefreshCw, Users, Wallet } from 'lucide-react';
import { useAppContext } from '@/components/app/app-context';
import { apiRequest } from '@/lib/frontend/api-client';
import type { AdminOverview } from '@/lib/frontend/dashboard/admin-types';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { formatMoney } from '@/lib/modules/finance/domain/csv';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { NativeSelect } from '@/components/ui/native-select';

function Card({ title, icon, href, children, className = '' }: { title: string; icon: ReactNode; href: string; children: ReactNode; className?: string }) {
  const t = useTranslations('application');
  return <section className={`ws-card ${className}`}><header className="ws-card-heading"><h2>{icon}{title}</h2><Link href={href}>{t('viewAll')}<ArrowRight aria-hidden="true" /></Link></header>{children}</section>;
}
export function SchoolAdminDashboard() {
  const context = useAppContext(), schoolId = context.currentSchool!.id, locale = useLocale();
  const t = useTranslations('application'), nav = useTranslations('navigation.items');
  const [year, setYear] = useState('');
  const overview = useQuery({ queryKey: ['admin-dashboard', schoolId, year], queryFn: async () => (await apiRequest<{ data: AdminOverview }>(`/api/v1/dashboard${year ? `?academicYearId=${encodeURIComponent(year)}` : ''}`)).data, refetchInterval: 60_000 });
  const announcements = useQuery({ queryKey: ['dashboard-announcements', schoolId], queryFn: () => announcementsApi.list({ page: 1, pageSize: 4 }) });
  const notifications = useQuery({ queryKey: ['dashboard-notifications', schoolId, context.user.id], queryFn: () => notificationsApi.list({ page: 1, pageSize: 4 }) });
  const data = overview.data, m = data?.metrics;
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);
  const money = (n: number) => formatMoney(n, locale, m!.currency);
  const date = data ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)) : null;
  const actions = [{ href: '/announcements', Icon: Megaphone, label: nav('announcements') }, { href: '/finance', Icon: Wallet, label: nav('finance') }, { href: '/timetable', Icon: CalendarDays, label: nav('timetable') }, { href: '/students', Icon: Users, label: nav('students') }];
  return <div className="ws-dashboard">
    <header className="ws-dashboard-intro"><div><h1>{t('title')}</h1><p>{t('intro')}</p></div>{date ? <div className="ws-school-date"><CalendarDays aria-hidden="true" /><div><time dateTime={data!.date}>{date}</time><span><bdi>{data!.timezone}</bdi></span></div></div> : null}</header>
    <div className="ws-dashboard-toolbar"><div className="ws-quick-actions">{actions.map(({ href, Icon, label }, i) => <Link key={href} className={i === 0 ? 'ws-action ws-action-primary' : 'ws-action'} href={href}><Icon aria-hidden="true" />{label}</Link>)}</div><div className="ws-year-control">{data?.years.length ? <label><span className="sr-only">{t('year')}</span><NativeSelect aria-label={t('year')} value={year || data.selectedYear?.id || ''} onChange={e => setYear(e.target.value)}><option value="" disabled>{t('year')}</option>{data.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</NativeSelect></label> : null}<button type="button" className="ws-icon-button" aria-label={t('refresh')} onClick={() => void overview.refetch()} disabled={overview.isFetching}><RefreshCw aria-hidden="true" className={overview.isFetching ? 'animate-spin' : ''} /></button></div></div>
    {overview.isPending ? <InlineLoading /> : overview.isError ? <ApiErrorState onRetry={() => void overview.refetch()} /> : !m ? <section className="ws-card ws-empty"><CalendarDays aria-hidden="true" /><p>{t('chooseYear')}</p></section> : <>
      <section className="ws-attention" aria-labelledby="attention-heading"><header><AlertTriangle aria-hidden="true" /><div><h2 id="attention-heading">{t('attention')}</h2><p>{t('attentionIntro')}</p></div></header>
        {m.pending || m.missingTimetable || m.overdueCents > 0 ? <div className="ws-attention-grid">
          {m.pending > 0 ? <Link href="/attendance"><ClipboardCheck aria-hidden="true" /><div><h3>{t('pending')}</h3><strong>{number(m.pending)}</strong><p>{t('pendingBody')}</p></div><ArrowRight aria-hidden="true" /></Link> : null}
          {m.missingTimetable > 0 ? <Link href="/timetable"><CalendarDays aria-hidden="true" /><div><h3>{t('missing')}</h3><strong>{number(m.missingTimetable)}</strong><p>{t('missingBody')}</p></div><ArrowRight aria-hidden="true" /></Link> : null}
          {m.overdueCents > 0 ? <Link href="/finance"><Wallet aria-hidden="true" /><div><h3>{t('overdue')}</h3><strong><bdi>{money(m.overdueCents)}</bdi></strong><p>{t('overdueBody')}: {number(m.overdueStudents)}</p></div><ArrowRight aria-hidden="true" /></Link> : null}
        </div> : <div className="ws-calm"><CheckCircle2 aria-hidden="true" /><div><h3>{t('clear')}</h3><p>{t('clearBody')}</p></div></div>}
      </section>
      <section aria-labelledby="glance-heading"><h2 id="glance-heading" className="sr-only">{t('glance')}</h2><div className="ws-metrics">
        {[{ label: t('enrolled'), value: number(m.enrolled), detail: t('selectedScope'), Icon: GraduationCap, tone: 'blue' }, { label: t('lessons'), value: number(data!.lessons.length), detail: `${number(m.classes)} ${t('activeClasses')}`, Icon: CalendarDays, tone: 'purple' }, { label: t('pending'), value: number(m.pending), detail: t('recordedSessions', { recorded: number(m.recorded), pending: number(m.pending) }), Icon: ClipboardCheck, tone: 'green' }, { label: t('outstanding'), value: money(m.outstandingCents), detail: t('selectedScope'), Icon: Wallet, tone: 'orange' }].map(({ label, value, detail, Icon, tone }) => <article className="ws-card ws-metric" key={label}><span className={`ws-stat-icon ws-tone-${tone}`}><Icon aria-hidden="true" /></span><div><h3>{label}</h3><strong><bdi>{value}</bdi></strong><p>{detail}</p></div></article>)}
      </div></section>
      <div className="ws-operations-grid">
        <Card title={t('operations')} icon={<CalendarDays aria-hidden="true" />} href="/timetable"><p className="ws-section-copy">{t('operationsIntro')}</p><p className="ws-read-only"><ClipboardCheck aria-hidden="true" />{t('readOnly')}</p>
          {data!.lessons.length ? <div className="ws-table-scroll"><table><caption className="sr-only">{t('operations')}</caption><thead><tr><th>{t('time')}</th><th>{t('lesson')}</th><th>{t('class')}</th><th>{t('recording')}</th></tr></thead><tbody>{data!.lessons.slice(0, 12).map(l => <tr key={`${l.publicationId}:${l.lessonKey}`}><td><bdi>{l.start}–{l.end}</bdi><span className={`ws-status ws-status-${l.status}`}>{t(l.status)}</span></td><td><strong>{l.subjectName}</strong><span>{l.teacherName}</span></td><td>{l.className}</td><td><Link href="/attendance" className="ws-recording-link">{l.recording === 'pending' ? t('pending') : t(l.recording)}</Link><span>{t('recordingDetail', { recorded: number(l.recorded), expected: number(l.expected) })}</span></td></tr>)}</tbody></table></div> : <p className="ws-empty">{t('noLessons')}</p>}
        </Card>
        <Card title={t('finance')} icon={<Wallet aria-hidden="true" />} href="/finance"><div className="ws-collected"><p>{t('collected')}</p><strong><bdi>{money(m.collectedCents)}</bdi></strong><small>{t('collectedScope')}</small></div><dl className="ws-finance-list">{[[t('outstanding'), money(m.outstandingCents)], [t('overdueBalance'), money(m.overdueCents)], [t('overdueStudents'), number(m.overdueStudents)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl><p className="ws-section-copy">{t('selectedScope')}: <bdi>{data!.selectedYear?.name}</bdi></p><div className="ws-academic-foot"><span>{number(m.teachers)} {t('activeTeachers')}</span><span>{number(m.classes)} {t('activeClasses')}</span></div></Card>
      </div>
    </>}
    <div className="ws-communication-grid">
      <Card title={t('recentAnnouncements')} icon={<Megaphone aria-hidden="true" />} href="/announcements">{announcements.isPending ? <InlineLoading /> : announcements.isError ? <ApiErrorState onRetry={() => void announcements.refetch()} /> : announcements.data.data.length ? <ul className="ws-feed">{announcements.data.data.map(a => <li key={a.id}><span className="ws-feed-dot" /><Link href={`/announcements/${a.id}`}><strong>{a.latestVersion?.title}</strong><span>{t(a.status)}</span></Link><time dateTime={a.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: context.currentSchool!.timezone }).format(new Date(a.updatedAt))}</time></li>)}</ul> : <p className="ws-empty">{t('noAnnouncements')}</p>}</Card>
      <Card title={t('recentNotifications')} icon={<Bell aria-hidden="true" />} href="/notifications">{notifications.isPending ? <InlineLoading /> : notifications.isError ? <ApiErrorState onRetry={() => void notifications.refetch()} /> : notifications.data.data.length ? <ul className="ws-feed">{notifications.data.data.map(n => <li key={n.id}><span className={`ws-feed-dot ${n.readAt ? 'ws-read' : ''}`} /><Link href="/notifications"><strong>{n.title}</strong><span>{n.body}</span></Link></li>)}</ul> : <p className="ws-empty">{t('noNotifications')}</p>}</Card>
    </div>
  </div>;
}
