import type { PublicationSnapshot } from '@/lib/frontend/grades/publications';

/** Only immutable publication fields; never substitute labels from current lookup lists. */
export function Snapshot({ value }: { value: PublicationSnapshot }) {
  const context = value.displayContext;
  return <div className="space-y-2 break-words">
    <p>{value.state === 'REVISED' ? 'Revised publication' : 'Initial publication'} · Version {value.publicationVersion} · {value.resultType}</p>
    <p className="font-semibold">Published value: {value.value}</p>
    {context ? <p>{context.studentName} · {context.subjectName ? `${context.subjectName} · ` : ''}{context.academicYearName}{context.academicPeriodName ? ` · ${context.academicPeriodName}` : ''}</p> : <p>Historical display labels were not recorded for this publication. No current names are substituted.</p>}
    <p>Published (UTC): <time dateTime={value.publishedAt}>{new Date(value.publishedAt).toISOString()}</time></p>
    <p className="text-sm">Rules version: {value.gradingConfigurationVersionId}</p>
  </div>;
}
