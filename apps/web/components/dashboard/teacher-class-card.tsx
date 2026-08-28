import { BookOpen, CalendarCheck, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { dashboardCopy as t } from '@/lib/frontend/dashboard/copy';
import { attendanceHref, gradesHref, homeworkHref, type TeacherClassView } from '@/lib/frontend/dashboard/types';

const actionClass = 'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TeacherClassCard({ group, today }: { group: TeacherClassView; today: string }) {
  return <article className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby={`teacher-class-${group.key}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.academicYearName}</p><h3 id={`teacher-class-${group.key}`} className="mt-1 text-lg font-semibold">{group.className}</h3></div><Link className={actionClass} href={attendanceHref(group.academicYearId, group.classId, today)} aria-label={t.attendanceAction(group.className)}><CalendarCheck className="size-4" aria-hidden="true" />{t.takeAttendance}</Link></div>
    <div className="mt-5 space-y-3"><h4 className="text-sm font-semibold">{t.subjects}</h4><ul className="space-y-3">{group.assignments.map((assignment) => <li key={assignment.id} className="rounded-md border bg-muted/20 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{assignment.subjectName}</p><p className="mt-1 text-xs text-muted-foreground">{t.effectiveFrom}: <time dateTime={assignment.effectiveFrom}>{assignment.effectiveFrom}</time></p></div><span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium">{assignment.status}</span></div><div className="mt-3 flex flex-wrap gap-2"><Link className={actionClass} href={gradesHref(assignment)} aria-label={t.gradeAction(assignment.subjectName, group.className)}><ClipboardList className="size-4" aria-hidden="true" />{t.openGradebooks}</Link><Link className={actionClass} href={homeworkHref(assignment)} aria-label={t.homeworkAction(assignment.subjectName, group.className)}><BookOpen className="size-4" aria-hidden="true" />{t.homework}</Link></div></li>)}</ul><p className="text-xs text-muted-foreground">{t.homeworkFilterNote}</p></div>
  </article>;
}
