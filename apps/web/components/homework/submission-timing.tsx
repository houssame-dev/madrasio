'use client';
import { useTranslations } from 'next-intl';
import { formatSchoolInstant } from '@school/shared';
import { useDomainText } from '@/i18n/use-domain-text';
import { useAppContext } from '@/components/app/app-context';
import { useHomeworkCopy } from '@/i18n/use-domain-copy';

/** Never fall back to browser timezone or reinterpret an unknown physical hand-in. */
export function SubmissionTiming({
  submittedAt,
  actualHandedInAt,
  createdAt,
  compact = false,
}: {
  submittedAt: string;
  actualHandedInAt?: string | null;
  createdAt?: string;
  compact?: boolean;
}) {
  const text = useDomainText();
  const ui = useTranslations('homeworkExperience');
  const t = useHomeworkCopy();
  const timezone = useAppContext().currentSchool?.timezone;
  const format = (value: string) => {
    if (!timezone) return text('School timezone unavailable');
    try {
      return formatSchoolInstant(value, timezone);
    } catch {
      return text('Time unavailable');
    }
  };
  return (
    <dl className={compact ? 'hw-timing hw-timing-compact' : 'hw-timing'}>
      <div>
        <dt>{t.submittedAt}</dt>
        <dd dir="auto">
          <bdi dir="ltr">{format(submittedAt)}</bdi>
        </dd>
      </div>
      <div>
        <dt>{t.actualTime}</dt>
        <dd dir="auto">
          {actualHandedInAt ? (
            <bdi dir="ltr">{format(actualHandedInAt)}</bdi>
          ) : compact ? (
            ui('unknown')
          ) : (
            t.unknownActual
          )}
        </dd>
      </div>
      {createdAt && !compact ? (
        <div>
          <dt>{t.firstRecorded}</dt>
          <dd dir="auto">
            <bdi dir="ltr">{format(createdAt)}</bdi>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
