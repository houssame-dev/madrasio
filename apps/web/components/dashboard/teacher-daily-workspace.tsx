'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, GraduationCap, MapPin, Megaphone, RefreshCw, Users } from 'lucide-react';
import { useAppContext } from '@/components/app/app-context';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { apiRequest } from '@/lib/frontend/api-client';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import type { RecipientAnnouncementDto } from '@/lib/frontend/announcements/types';
import type { TeacherAssignmentView, TeacherClassView } from '@/lib/frontend/dashboard/types';
import { nextTeacherLesson, teacherAttendanceAction, type TeacherLesson, type TeacherWorkspaceData } from '@/lib/frontend/dashboard/teacher-workspace-types';
import { TeacherClassCard } from './teacher-class-card';
import './teacher-workspace.css';

function Section({ title, icon, href, children, className = '' }: { title: string; icon: ReactNode; href?: string; children: ReactNode; className?: string }) {
  const t = useTranslations('teacherWorkspace');
  return <section className={`ws-card ${className}`}><header className="ws-card-heading"><h2>{icon}{title}</h2>{href ? <Link href={href}>{t('viewAll')}<ArrowRight aria-hidden="true" /></Link> : null}</header>{children}</section>;
}
function lessonHref(lesson: TeacherLesson, date: string) {
  return teacherAttendanceAction(lesson) === 'timetable' ? '/timetable' : `/attendance?${new URLSearchParams({ date, publicationId: lesson.publicationId, lessonKey: lesson.lessonKey })}`;
}
function LessonAction({ lesson, date }: { lesson: TeacherLesson; date: string }) {
  const t = useTranslations('teacherWorkspace'), action = teacherAttendanceAction(lesson);
  return <Link className={`ws-action ${action === 'record' || action === 'continue' ? 'ws-action-primary' : ''}`} href={lessonHref(lesson, date)}>{action === 'record' || action === 'continue' ? <CheckCircle2 aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}{t(action)}</Link>;
}
function AttendanceStatus({ lesson }: { lesson: TeacherLesson }) {
  const t = useTranslations('teacherWorkspace');
  const key = lesson.status === 'upcoming' || lesson.status === 'unavailable' ? lesson.status : lesson.expected > 0 && lesson.recorded >= lesson.expected ? 'recorded' : lesson.writable ? 'authorized' : 'readOnly';
  return <span className={`tw-status ${key === 'authorized' || key === 'recorded' ? 'tw-status-ready' : ''}`}><span aria-hidden="true" />{t(key)}</span>;
}
export function TeacherDailyWorkspace({ views, groups, profileLabel, unreadCount }: { views: TeacherAssignmentView[]; groups: TeacherClassView[]; profileLabel: string; unreadCount?: number }) {
  const t = useTranslations('teacherWorkspace'), nav = useTranslations('navigation.items'), locale = useLocale(), app = useAppContext(), schoolId = app.currentSchool!.id;
  const workspace = useQuery({ queryKey: ['teacher-workspace', schoolId, app.user.id], queryFn: async () => (await apiRequest<{ data: TeacherWorkspaceData }>('/api/v1/dashboard/teacher')).data, refetchInterval: 60_000 });
  const announcements = useQuery({ queryKey: ['teacher-workspace-announcements', schoolId, app.user.id], queryFn: () => apiRequest<{ data: RecipientAnnouncementDto[] }>('/api/v1/me/announcements?page=1&pageSize=4') });
  const notifications = useQuery({ queryKey: ['teacher-workspace-notifications', schoolId, app.user.id], queryFn: () => notificationsApi.list({ page: 1, pageSize: 4 }) });
  const data = workspace.data, next = data ? nextTeacherLesson(data.lessons) : null;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const dateLabel = data ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)) : '';
  const current = data ? views.filter(v => v.effectiveFrom <= data.date && (!v.effectiveUntil || v.effectiveUntil >= data.date)) : [];
  const attention = data ? [
    { count: data.pendingAttendance, label: t('pending'), body: t('pendingBody'), href: data.lessons.find(l => l.writable && l.status !== 'upcoming' && l.expected > l.recorded) ? lessonHref(data.lessons.find(l => l.writable && l.status !== 'upcoming' && l.expected > l.recorded)!, data.date) : '/attendance', Icon: ClipboardCheck, tone: 'blue' },
    { count: data.homeworkReview, label: t('review'), body: t('reviewBody'), href: '/homework', Icon: BookOpen, tone: 'orange' },
    { count: unreadCount, label: t('unread'), body: t('unreadBody'), href: '/notifications', Icon: Bell, tone: 'purple' },
  ].filter(item => item.count !== undefined && item.count > 0) : [];
  return <div className="ws-dashboard teacher-workspace">
    <header className="ws-dashboard-intro"><div><h1>{t('title')}</h1><p>{t('intro')}</p><p className="tw-identity"><bdi>{profileLabel}</bdi></p></div>{data ? <div className="ws-school-date"><CalendarDays aria-hidden="true" /><div><time dateTime={data.date}>{dateLabel}</time><span><bdi>{data.timezone}</bdi></span></div></div> : null}</header>
    <div className="ws-dashboard-toolbar"><div className="ws-quick-actions">{[{ href: '/attendance', Icon: ClipboardCheck, label: nav('attendance') }, { href: '/timetable', Icon: CalendarDays, label: nav('timetable') }, { href: '/homework', Icon: BookOpen, label: nav('homework') }, { href: '/grades', Icon: GraduationCap, label: nav('grades') }].map(({ href, Icon, label }) => <Link className="ws-action" href={href} key={href}><Icon aria-hidden="true" />{label}</Link>)}</div><button className="ws-icon-button" aria-label={t('refresh')} disabled={workspace.isFetching} onClick={() => void workspace.refetch()}><RefreshCw aria-hidden="true" /></button></div>
    {workspace.isPending ? <InlineLoading /> : workspace.isError ? <ApiErrorState onRetry={() => void workspace.refetch()} /> : data ? <>
      <div className="tw-priority-grid">
        <Section title={t('next')} icon={<CalendarDays aria-hidden="true" />} className="tw-next">
          {next ? <div className="tw-next-content"><div className="tw-lesson-detail"><div className="tw-subject"><span className="ws-stat-icon ws-tone-purple"><BookOpen aria-hidden="true" /></span><div><h3><bdi>{next.subjectName}</bdi></h3><p>{t('class')}: <bdi>{next.className}</bdi></p></div></div><p className="tw-lesson-meta"><Clock3 aria-hidden="true" /><bdi>{next.start} – {next.end}</bdi><MapPin aria-hidden="true" /><bdi>{next.roomName || t('noRoom')}</bdi></p><p className="tw-lesson-meta"><CalendarDays aria-hidden="true" />{dateLabel}</p></div><div className="tw-lesson-actions"><AttendanceStatus lesson={next} /><LessonAction lesson={next} date={data.date} /><p>{t(teacherAttendanceAction(next) === 'timetable' ? 'upcomingHint' : next.writable && next.recorded < next.expected ? 'authorityHint' : 'readOnlyHint')}</p><Link className="ws-action" href="/timetable"><CalendarDays aria-hidden="true" />{t('timetable')}</Link></div></div> : <div className="tw-empty"><CheckCircle2 aria-hidden="true" /><h3>{t(data.lessons.length ? 'dayComplete' : 'noLessons')}</h3><p>{t(data.lessons.length ? 'dayCompleteBody' : 'noLessonsBody')}</p><Link href="/timetable" className="ws-action">{t('timetable')}</Link></div>}
        </Section>
        <Section title={t('attention')} icon={<AlertTriangle aria-hidden="true" />} className="tw-attention">{attention.length ? <div className="tw-attention-list">{attention.map(({ count, label, body, href, Icon, tone }) => <Link key={label} href={href}><span className={`ws-stat-icon ws-tone-${tone}`}><Icon aria-hidden="true" /></span><div><h3>{label}</h3><p>{body}</p></div><strong>{number(count!)}</strong><ArrowRight aria-hidden="true" /></Link>)}</div> : <div className="tw-empty"><CheckCircle2 aria-hidden="true" /><h3>{t('clear')}</h3><p>{t('clearBody')}</p></div>}</Section>
      </div>
      <section aria-label={t('overview')} className="tw-overview">{[
        { value: data.lessons.length, label: t('lessons'), detail: t('published'), Icon: CalendarDays, tone: 'blue' },
        { value: new Set(current.map(v => `${v.academicYearId}:${v.classId}`)).size, label: t('assignedClasses'), detail: t('currentAssignments'), Icon: Users, tone: 'green' },
        { value: new Set(current.map(v => v.subjectId)).size, label: t('subjects'), detail: t('currentAssignments'), Icon: BookOpen, tone: 'purple' },
        { value: data.pendingAttendance, label: t('pending'), detail: t('pendingBody'), Icon: ClipboardCheck, tone: 'orange' },
      ].map(({ value, label, detail, Icon, tone }) => <article className="ws-card" key={label}><span className={`ws-stat-icon ws-tone-${tone}`}><Icon aria-hidden="true" /></span><div><h2>{label}</h2><strong>{number(value)}</strong><p>{detail}</p></div></article>)}</section>
      <div className="tw-work-grid"><Section title={t('schedule')} icon={<CalendarDays aria-hidden="true" />} href="/timetable">{data.lessons.length ? <div className="tw-table-scroll" tabIndex={0} role="region" aria-label={t('schedule')}><table><thead><tr>{['time', 'lesson', 'class', 'room', 'attendance', 'action'].map(k => <th key={k} scope="col">{t(k as 'time')}</th>)}</tr></thead><tbody>{data.lessons.map(l => <tr key={`${l.publicationId}:${l.lessonKey}`} className={l.status === 'ongoing' ? 'tw-current' : ''}><td><bdi>{l.start} – {l.end}</bdi></td><td><strong><bdi>{l.subjectName}</bdi></strong><small>{t(l.status)}</small></td><td><bdi>{l.className}</bdi></td><td><bdi>{l.roomName || '—'}</bdi></td><td><AttendanceStatus lesson={l} /></td><td><LessonAction lesson={l} date={data.date} /></td></tr>)}</tbody></table></div> : <p className="tw-empty">{t('noLessons')}</p>}</Section>
      <Section title={t('classes')} icon={<Users aria-hidden="true" />}>{groups.map(group => <TeacherClassCard key={group.key} group={group} today={data.date} />)}</Section></div>
    </> : null}
    <div className="ws-communication-grid"><Section title={t('announcements')} icon={<Megaphone aria-hidden="true" />} href="/announcements/inbox">{announcements.isPending ? <InlineLoading /> : announcements.isError ? <div className="tw-empty"><p>{t('feedError')}</p><button className="ws-action" onClick={() => void announcements.refetch()}>{t('retry')}</button></div> : announcements.data.data.length ? <ul className="ws-feed">{announcements.data.data.map(a => <li key={a.id}><Link href={`/announcements/inbox/${a.id}`}><strong><bdi>{a.title}</bdi></strong><span>{t('publishedStatus')} · <time dateTime={a.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: app.currentSchool!.timezone }).format(new Date(a.publishedAt))}</time></span></Link></li>)}</ul> : <p className="tw-empty">{t('feedEmpty')}</p>}</Section>
    <Section title={t('notifications')} icon={<Bell aria-hidden="true" />} href="/notifications">{notifications.isPending ? <InlineLoading /> : notifications.isError ? <div className="tw-empty"><p>{t('feedError')}</p><button className="ws-action" onClick={() => void notifications.refetch()}>{t('retry')}</button></div> : notifications.data.data.length ? <ul className="ws-feed">{notifications.data.data.map(n => <li key={n.id}><Link href="/notifications"><strong><bdi>{n.title}</bdi></strong><span><bdi>{n.body}</bdi></span></Link></li>)}</ul> : <p className="tw-empty">{t('feedEmpty')}</p>}</Section></div>
  </div>;
}
