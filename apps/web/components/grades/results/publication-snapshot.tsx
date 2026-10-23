'use client';
import type { PublicationSnapshot } from '@/lib/frontend/grades/publications';
import { useLocale, useTranslations } from 'next-intl';
import { useDomainText } from '@/i18n/use-domain-text';

/** Only immutable publication fields; never substitute labels from current lookup lists. */
export function Snapshot({ value }: { value: PublicationSnapshot }) {
  const text = useDomainText();
  const locale = useLocale();
  const copy = useTranslations('communicationUi');
  const ui = useTranslations('domainUi');
  const context = value.displayContext;
  return <div className="min-w-0 space-y-3 break-words">
    <p className="text-sm font-medium">{value.state === 'REVISED' ? text("Revised publication") : text("Initial publication")} · {ui('version', { version: value.publicationVersion })} · {text(value.resultType)}</p>
    <p className="text-2xl font-semibold tabular-nums">{ui('publishedValue', { value: value.value })}</p>
    {context ? <p><bdi>{context.studentName}</bdi> · {context.subjectName ? <><bdi>{context.subjectName}</bdi> · </> : null}<bdi>{context.academicYearName}</bdi>{context.academicPeriodName ? <> · <bdi>{context.academicPeriodName}</bdi></> : null}</p> : <p>{text("Historical display labels were not recorded for this publication. No current names are substituted.")}</p>}
    <p className="text-sm text-muted-foreground">{copy('publishedAt')} · <time dateTime={value.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value.publishedAt))}</time> ({copy('utc')})</p>
    <details className="rounded-md border p-3 text-sm text-muted-foreground"><summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy('technicalDetails')}</summary><div className="mt-3 space-y-2"><p>{copy('exactTimestamp')}: <bdi dir="ltr">{new Date(value.publishedAt).toISOString()}</bdi></p><p>{ui('rulesVersion', { id: value.gradingConfigurationVersionId })}</p></div></details>
  </div>;
}
