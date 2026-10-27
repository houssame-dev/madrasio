'use client';
import { useState } from 'react';
import { Button } from '@school/ui';
import { useParentPortalCopy } from '@/i18n/use-people-copy';
import { PublishedResults } from './published-results';
import type { ParentResultType } from '@/lib/frontend/parent-portal/types';
export function ChildResultsWorkspace({
  schoolId,
  studentId,
  yearId,
}: {
  schoolId: string;
  studentId: string;
  yearId: string;
}) {
  const t = useParentPortalCopy();
  const [type, setType] = useState<ParentResultType>('SUBJECT');
  const title =
    type === 'SUBJECT' ? t.subjectResults : type === 'PERIOD' ? t.periodResults : t.annualResults;
  return (
    <div className="gr-workspace space-y-5">
      <nav className="gr-tabs" aria-label={title}>
        {(['SUBJECT', 'PERIOD', 'ANNUAL'] as const).map((value) => (
          <Button
            key={value}
            variant={type === value ? 'default' : 'outline'}
            aria-pressed={type === value}
            onClick={() => setType(value)}
          >
            {value === 'SUBJECT'
              ? t.subjectResults
              : value === 'PERIOD'
                ? t.periodResults
                : t.annualResults}
          </Button>
        ))}
      </nav>
      <PublishedResults
        key={`${schoolId}:${studentId}:${yearId}:${type}`}
        schoolId={schoolId}
        studentId={studentId}
        yearId={yearId}
        type={type}
        title={title}
      />
    </div>
  );
}
