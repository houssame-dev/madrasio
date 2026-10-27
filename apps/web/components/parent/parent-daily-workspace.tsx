'use client';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, Bell, BookOpen, Building2, CalendarDays, CheckCircle2, GraduationCap, Megaphone, Users } from 'lucide-react';
import { schoolWallTimeToInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { NativeSelect } from '@/components/ui/native-select';
import { InlineLoading } from '@/components/ui/states';
import { apiRequest } from '@/lib/frontend/api-client';
import { childAcademicYearsQuery, childPlacementQuery, childAttendanceQuery } from '@/lib/frontend/parent-portal/queries';
import { parentChildApi } from '@/lib/frontend/parent-portal/api';
import { childJourneyHref, resolveParentYear, type ParentWeekOverview } from '@/lib/frontend/parent-portal/dashboard-types';
import type { ParentChildView, ParentResultType } from '@/lib/frontend/parent-portal/types';
import type { RecipientAnnouncementDto } from '@/lib/frontend/announcements/types';
import type { readPublished } from '@/lib/modules/timetable/application/publication';
import { notificationsApi } from '@/lib/frontend/notifications/api';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import { usePeopleText } from '@/i18n/use-people-text';
import './parent-workspace.css';

type PublishedData = Awaited<ReturnType<typeof readPublished>>;
function Section({ title, icon, href, children, id }: { title:string; icon:ReactNode; href?:string; children:ReactNode; id?:string }) {
  const t = useTranslations('parentWorkspace');
  return <section className="ws-card" id={id}><header className="ws-card-heading"><h2>{icon}{title}</h2>{href ? <Link href={href}>{t('viewAll')}<ArrowRight aria-hidden="true" /></Link> : null}</header>{children}</section>;
}
function ReadError({ retry }: { retry:()=>void }) {
  const t=useTranslations('parentWorkspace'); return <div className="pw-message" role="status"><p>{t('error')}</p><button className="ws-action" onClick={retry}>{t('retry')}</button></div>;
}
export function ParentDailyWorkspace({ linkedChildren }: { linkedChildren:ParentChildView[] }) {
  const app=useAppContext(), locale=useLocale(), t=useTranslations('parentWorkspace');
  const [selected,setSelected]=useState(linkedChildren[0].id);
  const child=linkedChildren.find(c=>c.id===selected) ?? linkedChildren[0];
  const today=schoolCalendarToday(app.currentSchool!.timezone);
  const announcements=useQuery({queryKey:['parent-dashboard-announcements',app.currentSchool!.id,app.user.id],queryFn:()=>apiRequest<{data:RecipientAnnouncementDto[]}>('/api/v1/me/announcements?page=1&pageSize=4')});
  const notifications=useQuery({queryKey:['parent-dashboard-notifications',app.currentSchool!.id,app.user.id],queryFn:()=>notificationsApi.list({page:1,pageSize:4})});
  return <div className="ws-dashboard parent-workspace">
    <header className="ws-dashboard-intro"><div><h1>{t('title')}</h1><p>{t('intro')}</p></div><div className="ws-school-date"><CalendarDays aria-hidden="true" /><div><time dateTime={today}>{new Intl.DateTimeFormat(locale,{dateStyle:'full',timeZone:'UTC'}).format(new Date(`${today}T12:00:00Z`))}</time><span><bdi>{app.currentSchool!.timezone}</bdi></span></div></div></header>
    <SelectedChild key={`${app.currentSchool!.id}:${app.user.id}:${child.id}`} child={child} today={today} selector={linkedChildren.length>1 ? <label className="pw-child-selector"><span className="sr-only">{t('chooseChild')}</span><NativeSelect value={child.id} onChange={e=>setSelected(e.target.value)}>{linkedChildren.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</NativeSelect></label> : null} announcement={announcements.data?.data[0]} announcementPending={announcements.isPending} announcementError={announcements.isError} />
    <section aria-label={t('communication')} className="ws-communication-grid"><Section title={t('announcements')} icon={<Megaphone aria-hidden="true" />} href="/announcements/inbox">{announcements.isPending ? <InlineLoading /> : announcements.isError ? <ReadError retry={()=>void announcements.refetch()} /> : announcements.data.data.length ? <ul className="ws-feed">{announcements.data.data.map(a=><li key={a.id}><span className="ws-feed-dot" aria-hidden="true" /><Link href={`/announcements/inbox/${a.id}`}><strong><bdi>{a.title}</bdi></strong><span>{t('published')} · <time dateTime={a.publishedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:app.currentSchool!.timezone}).format(new Date(a.publishedAt))}</time></span></Link></li>)}</ul> : <p className="pw-message">{t('emptyFeed')}</p>}</Section>
    <Section title={t('notifications')} icon={<Bell aria-hidden="true" />} href="/notifications"><p className="pw-section-copy">{t('personal')}</p>{notifications.isPending ? <InlineLoading /> : notifications.isError ? <ReadError retry={()=>void notifications.refetch()} /> : notifications.data.data.length ? <ul className="ws-feed">{notifications.data.data.map(n=><li key={n.id}><span className={`ws-feed-dot ${n.readAt?'ws-read':''}`} aria-hidden="true" /><Link href="/notifications"><strong><bdi>{n.title}</bdi></strong><span><bdi>{n.body}</bdi></span></Link></li>)}</ul> : <p className="pw-message">{t('emptyFeed')}</p>}</Section></section>
  </div>;
}
function SelectedChild({child,today,selector,announcement,announcementPending,announcementError}:{child:ParentChildView;today:string;selector:ReactNode;announcement?:RecipientAnnouncementDto;announcementPending:boolean;announcementError:boolean}) {
  const app=useAppContext(),schoolId=app.currentSchool!.id,userId=app.user.id,locale=useLocale(),t=useTranslations('parentWorkspace'),text=usePeopleText();
  const yearsConfig=childAcademicYearsQuery(schoolId,child.id);
  const years=useQuery({...yearsConfig,queryKey:[...yearsConfig.queryKey,userId]});
  const [requested,setRequested]=useState('');
  const yearId=resolveParentYear(years.data??[],today,requested),year=years.data?.find(y=>y.id===yearId);
  const placementConfig=childPlacementQuery(schoolId,child.id,yearId);
  const placement=useQuery({...placementConfig,queryKey:[...placementConfig.queryKey,userId],enabled:!!yearId});
  const overview=useQuery({queryKey:['parent-dashboard-week',schoolId,userId,child.id,yearId],queryFn:async()=>(await apiRequest<{data:ParentWeekOverview}>(`/api/v1/parent/children/${child.id}/dashboard?academicYearId=${yearId}`)).data,enabled:!!yearId,refetchInterval:60_000});
  const attendanceConfig=childAttendanceQuery(schoolId,child.id,yearId,1);
  const attendance=useQuery({...attendanceConfig,queryKey:[...attendanceConfig.queryKey,userId],enabled:!!yearId});
  const resultTypes=['SUBJECT','PERIOD','ANNUAL'] as const;
  const results=useQueries({queries:resultTypes.map(type=>({queryKey:['parent-dashboard-results',schoolId,userId,child.id,yearId,type],queryFn:()=>parentChildApi.results(child.id,yearId,type,1,2),enabled:!!yearId}))});
  const info=overview.data,p=placement.data;
  const currentPlacement=!!info&&!!p&&!!year&&year.startDate<=info.date&&year.endDate>=info.date&&p.effectiveFrom<=info.date&&(!p.effectiveUntil||p.effectiveUntil>=info.date);
  const timetable=useQuery({queryKey:['parent-dashboard-timetable',schoolId,userId,child.id,yearId,info?.date],queryFn:async()=>{const response=await apiRequest<{data:PublishedData}>(`/api/v1/timetable/published?${new URLSearchParams({studentId:child.id,date:info!.date})}`);if(response.data.selectedStudentId!==child.id)throw new Error('Child timetable context mismatch');return response.data;},enabled:currentPlacement});
  const school=app.memberships.find(m=>m.schoolId===schoolId)?.schoolName;
  const profile=yearId?childJourneyHref(child.id,yearId):`/children/${child.id}`;
  const href=(section:'attendance'|'homework'|'results')=>childJourneyHref(child.id,yearId,section);
  const timetableHref=`/timetable?${new URLSearchParams({studentId:child.id,date:info?.date??today})}`;
  const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  const number=(value:number)=>new Intl.NumberFormat(locale).format(value);
  const day=info?((new Date(`${info.date}T12:00:00Z`).getUTCDay()+6)%7)+1:0;
  const lessons=timetable.data?.schedules.filter(s=>s.classId===p?.classId&&s.effectiveFrom<=info!.date&&s.effectiveUntil>=info!.date).flatMap(s=>s.lessons.filter(l=>l.weekday===day).map(l=>({...l,publicationId:s.id}))).sort((a,b)=>a.start.localeCompare(b.start))??[];
  const lessonState=(start:string,end:string)=>{try{const now=Date.parse(info!.asOf),from=Date.parse(schoolWallTimeToInstant(`${info!.date}T${start}:00`,info!.timezone)),until=Date.parse(schoolWallTimeToInstant(`${info!.date}T${end}:00`,info!.timezone));return now<from?'upcoming':now<until?'ongoing':'completed';}catch{return 'timingUnavailable';}};
  return <>
    <Section title={t('child')} icon={<GraduationCap aria-hidden="true" />}><div className="pw-child-overview"><div className="pw-child-identity"><span className="ws-avatar" aria-hidden="true">{child.firstName.slice(0,1)}{child.lastName.slice(0,1)}</span><div><h3><bdi>{child.firstName} {child.lastName}</bdi></h3>{selector}<p><bdi>{child.studentCode}</bdi></p></div></div><dl className="pw-placement"><div><dt><Users aria-hidden="true" />{t('class')}</dt><dd><bdi>{placement.isPending&&yearId?'…':p?.className??t('unavailable')}</bdi></dd></div><div><dt><CalendarDays aria-hidden="true" />{t('year')}</dt><dd><bdi>{year?.name??t('unavailable')}</bdi></dd></div><div><dt><Building2 aria-hidden="true" />{t('school')}</dt><dd><bdi>{school??t('unavailable')}</bdi></dd></div>{p?<div><dt>{t('placement')}</dt><dd><bdi>{[p.stageName,p.levelName,p.trackName].filter(Boolean).join(' · ')}</bdi></dd></div>:null}</dl><Link className="ws-action" href={profile}>{t('profile')}<ArrowRight className="pw-arrow" aria-hidden="true" /></Link></div>
      {years.isPending?<InlineLoading />:years.isError?<ReadError retry={()=>void years.refetch()} />:!years.data.length?<p className="pw-message">{t('noYears')}</p>:years.data.length>1||!yearId?<div className="pw-year"><label><span>{t('year')}</span><NativeSelect value={yearId} onChange={e=>setRequested(e.target.value)}><option value="">{t('chooseYear')}</option>{years.data.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}</NativeSelect></label>{!yearId?<p>{t('ambiguous')}</p>:null}</div>:null}
      {yearId&&placement.isError?<ReadError retry={()=>void placement.refetch()} />:yearId&&placement.isSuccess&&!p?<p className="pw-section-copy">{t('placementUnavailable')}</p>:null}
    </Section>
    {yearId?<>
      <section className="ws-attention" aria-labelledby="parent-important-heading"><header><Bell aria-hidden="true" /><div><h2 id="parent-important-heading">{t('important')}</h2><p>{t('importantIntro')}</p></div></header>{overview.isPending?<InlineLoading />:overview.isError?<ReadError retry={()=>void overview.refetch()} />:info?<div className="pw-important-grid"><Link href={href('homework')}><span className="ws-stat-icon ws-tone-orange"><BookOpen aria-hidden="true" /></span><div><h3>{t('dueCount')}</h3><strong>{number(info.upcomingCount)}</strong><p>{t('dueBody')}</p></div><ArrowRight className="pw-arrow" aria-hidden="true" /></Link><Link href={href('attendance')}><span className="ws-stat-icon ws-tone-green"><CalendarDays aria-hidden="true" /></span><div><h3>{t('absenceCount')}</h3><strong>{number(info.absenceRecords)}</strong><p>{t('absenceBody')}</p></div><ArrowRight className="pw-arrow" aria-hidden="true" /></Link><div><span className="ws-stat-icon ws-tone-purple"><Megaphone aria-hidden="true" /></span><div><h3>{t('schoolUpdate')}</h3>{announcementPending?<InlineLoading />:announcementError?<p>{t('error')}</p>:announcement?<Link className="pw-update-title" href={`/announcements/inbox/${announcement.id}`}><bdi>{announcement.title}</bdi></Link>:<p>{t('noUpdate')}</p>}<p>{t('schoolUpdateBody')}</p></div></div></div>:null}</section>
      <section aria-label={t('week')} className="pw-week-grid"><Section title={t('homework')} icon={<BookOpen aria-hidden="true" />} href={href('homework')}><p className="pw-section-copy">{t('homeworkIntro')}</p>{overview.isPending?<InlineLoading />:overview.isError?<ReadError retry={()=>void overview.refetch()} />:info?.homework.length?<ul className="pw-homework">{info.homework.map(h=><li key={h.id}><details><summary><span><strong><bdi>{h.subjectName}</bdi></strong><span><bdi>{h.title}</bdi></span></span><time dateTime={h.dueDate}>{date(h.dueDate)}</time></summary><p className="pw-instructions">{h.description||t('noInstructions')}</p><p className="pw-section-copy">{t('due')}: {date(h.dueDate)} · <bdi>{h.periodName}</bdi></p></details></li>)}</ul>:<p className="pw-message">{t('noHomework')}</p>}</Section>
      <Section title={t('timetable')} icon={<CalendarDays aria-hidden="true" />} href={timetableHref}><p className="pw-section-copy">{t('timetableIntro')}</p>{overview.isPending||placement.isPending?<InlineLoading />:!currentPlacement?<p className="pw-message">{t('otherYear')}</p>:timetable.isPending?<InlineLoading />:timetable.isError?<ReadError retry={()=>void timetable.refetch()} />:lessons.length?<div className="ws-table-scroll pw-timetable" tabIndex={0} role="region" aria-label={t('timetable')}><table><thead><tr>{(['time','subject','teacher','room','status'] as const).map(k=><th scope="col" key={k}>{t(k)}</th>)}</tr></thead><tbody>{lessons.map(l=><tr key={`${l.publicationId}:${l.lessonKey}`}><td><bdi>{l.start} – {l.end}</bdi></td><td><strong><bdi>{l.subjectName}</bdi></strong></td><td><bdi>{l.teacherName}</bdi></td><td><bdi>{l.roomName??t('noRoom')}</bdi></td><td><span className={`pw-status pw-status-${lessonState(l.start,l.end)}`}>{t(lessonState(l.start,l.end))}</span></td></tr>)}</tbody></table></div>:<p className="pw-message">{t('noLessons')}</p>}</Section></section>
      <Section title={t('progress')} icon={<GraduationCap aria-hidden="true" />}><p className="pw-section-copy">{t('readOnly')}</p><div className="pw-progress-grid"><article className="pw-progress"><header><span className="ws-stat-icon ws-tone-green"><CheckCircle2 aria-hidden="true" /></span><div><h3>{t('attendance')}</h3><p>{t('attendanceIntro')}</p></div></header>{attendance.isPending?<InlineLoading />:attendance.isError?<ReadError retry={()=>void attendance.refetch()} />:attendance.data.data.length?<ul className="pw-attendance">{attendance.data.data.slice(0,4).map(a=><li key={a.id}><div><strong>{text(a.status)}</strong><p><bdi>{a.session?.subjectName??a.className}</bdi>{a.session?<span> · <bdi>{a.session.start}–{a.session.end}</bdi></span>:null}</p></div><time dateTime={a.date}>{date(a.date)}</time></li>)}</ul>:<p className="pw-message">{t('noAttendance')}</p>}<Link className="pw-text-link" href={href('attendance')}>{t('viewAttendance')}<ArrowRight className="pw-arrow" aria-hidden="true" /></Link></article>
      <article className="pw-progress"><header><span className="ws-stat-icon ws-tone-blue"><GraduationCap aria-hidden="true" /></span><div><h3>{t('results')}</h3><p>{t('resultsIntro')}</p></div></header>{results.map((q,i)=><ResultPreview key={resultTypes[i]} type={resultTypes[i]} query={q} studentId={child.id} />)}<Link className="pw-text-link" href={href('results')}>{t('viewResults')}<ArrowRight className="pw-arrow" aria-hidden="true" /></Link></article></div></Section>
    </>:null}
  </>;
}
function ResultPreview({type,query,studentId}:{type:ParentResultType;query:{isPending:boolean;isError:boolean;data?:Awaited<ReturnType<typeof parentChildApi.results>>;refetch:()=>unknown};studentId:string}) {
  const t=useTranslations('parentWorkspace');
  return <div className="pw-result-group"><h4>{t(type==='SUBJECT'?'subjectResult':type==='PERIOD'?'periodResult':'annualResult')}</h4>{query.isPending?<InlineLoading />:query.isError?<ReadError retry={()=>void query.refetch()} />:query.data?.data.length?<ul>{query.data.data.map(r=><li key={r.publicationId}><Link href={`/children/${studentId}/results/${r.publicationId}`} aria-label={`${t('publication')} · ${r.subject?.name??r.academicPeriod?.name??r.academicYear.name}`}><bdi>{r.subject?.name??r.academicPeriod?.name??r.academicYear.name}</bdi><strong><bdi>{r.value}</bdi></strong><span>{t('revision',{version:String(r.publicationVersion)})}</span></Link></li>)}</ul>:<p>{t('noResults')}</p>}</div>;
}
