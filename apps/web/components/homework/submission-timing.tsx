'use client';
import { formatSchoolInstant } from '@school/shared';
import { useDomainText } from '@/i18n/use-domain-text';
import { useAppContext } from '@/components/app/app-context';
import { useHomeworkCopy } from '@/i18n/use-domain-copy';

/** Never fall back to browser timezone or reinterpret an unknown physical hand-in. */
export function SubmissionTiming({ submittedAt, actualHandedInAt, createdAt }: {
  submittedAt: string; actualHandedInAt?: string | null; createdAt?: string;
}) {
  const text = useDomainText();
  const t = useHomeworkCopy();
  const timezone = useAppContext().currentSchool?.timezone;
  const format = (value: string) => {
    if (!timezone) return text("School timezone unavailable");
    try { return formatSchoolInstant(value, timezone); } catch { return text("Time unavailable"); }
  };
  return <dl className="grid gap-3 text-sm sm:grid-cols-2">
    <div><dt>{t.submittedAt}</dt><dd dir="auto">{format(submittedAt)}</dd></div>
    <div><dt>{t.actualTime}</dt><dd dir="auto">{actualHandedInAt ? format(actualHandedInAt) : t.unknownActual}</dd></div>
    {createdAt ? <div><dt>{t.firstRecorded}</dt><dd dir="auto">{format(createdAt)}</dd></div> : null}
  </dl>;
}
