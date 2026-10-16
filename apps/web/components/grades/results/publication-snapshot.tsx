'use client';
import type { PublicationSnapshot } from '@/lib/frontend/grades/publications';
import { useTranslations } from 'next-intl';
import { useDomainText } from '@/i18n/use-domain-text';

/** Only immutable publication fields; never substitute labels from current lookup lists. */
export function Snapshot({ value }: { value: PublicationSnapshot }) {
  const text = useDomainText();
  const ui = useTranslations('domainUi');
  const context = value.displayContext;
  return <div className="space-y-2 break-words">
    <p>{value.state === 'REVISED' ? text("Revised publication") : text("Initial publication")} · {ui('version', { version: value.publicationVersion })} · {text(value.resultType)}</p>
    <p className="font-semibold">{ui('publishedValue', { value: value.value })}</p>
    {context ? <p><bdi>{context.studentName}</bdi> · {context.subjectName ? <><bdi>{context.subjectName}</bdi> · </> : null}<bdi>{context.academicYearName}</bdi>{context.academicPeriodName ? <> · <bdi>{context.academicPeriodName}</bdi></> : null}</p> : <p>{text("Historical display labels were not recorded for this publication. No current names are substituted.")}</p>}
    <p>{text("Published (UTC):")}<time dir="ltr" dateTime={value.publishedAt}>{new Date(value.publishedAt).toISOString()}</time></p>
    <p className="text-sm">{ui('rulesVersion', { id: value.gradingConfigurationVersionId })}</p>
  </div>;
}
