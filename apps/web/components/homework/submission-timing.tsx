'use client';
import { formatSchoolInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';

/** Never fall back to browser timezone or reinterpret an unknown physical hand-in. */
export function SubmissionTiming({ submittedAt, actualHandedInAt, createdAt }: {
  submittedAt: string; actualHandedInAt?: string | null; createdAt?: string;
}) {
  const timezone = useAppContext().currentSchool?.timezone;
  const format = (value: string) => {
    if (!timezone) return 'School timezone unavailable';
    try { return formatSchoolInstant(value, timezone); } catch { return 'Time unavailable'; }
  };
  return <dl className="grid gap-3 text-sm sm:grid-cols-2">
    <div><dt>{t.submittedAt}</dt><dd>{format(submittedAt)}</dd></div>
    <div><dt>{t.actualTime}</dt><dd>{actualHandedInAt ? format(actualHandedInAt) : t.unknownActual}</dd></div>
    {createdAt ? <div><dt>{t.firstRecorded}</dt><dd>{format(createdAt)}</dd></div> : null}
  </dl>;
}
