'use client';

import type { ReactNode } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDomainText } from '@/i18n/use-domain-text';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';

import { InlineFeedback, Modal } from '@/components/academic/ui';

import { homeworkApi } from '@/lib/frontend/homework/api';

import { homeworkCopy as copy } from '@/lib/frontend/homework/copy';

import { useHomeworkCopy } from '@/i18n/use-domain-copy';

import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';

import { invalidateHomework } from '@/lib/frontend/homework/mutations';

import { homeworkKeys } from '@/lib/frontend/homework/queries';

import type { HomeworkStatus } from '@/lib/frontend/homework/types';

const next: Record<
  HomeworkStatus,
  { status: HomeworkStatus; label: string; description: string } | undefined
> = {
  DRAFT: { status: 'PUBLISHED', label: copy.publish, description: copy.publishDescription },

  PUBLISHED: { status: 'CLOSED', label: copy.close, description: copy.closeDescription },

  CLOSED: { status: 'ARCHIVED', label: copy.archive, description: copy.archiveDescription },
  ARCHIVED: undefined,
};

export function HomeworkLifecycleActions({
  schoolId,
  homeworkId,
  status,
  context,
  classes = [],
}: {
  schoolId: string;
  homeworkId: string;
  status: HomeworkStatus;
  context?: ReactNode;
  classes?: { id: string; name: string }[];
}) {
  const text = useDomainText(),
    t = useHomeworkCopy(),
    ui = useTranslations('homeworkExperience'),
    common = useTranslations('collection');

  const cache = useQueryClient(),
    [confirming, setConfirming] = useState(false),
    transition = next[status];

  const targets = useQuery({
    queryKey: homeworkKeys.targets(schoolId, homeworkId),
    queryFn: () => homeworkApi.targets(homeworkId),
    enabled: confirming && status === 'DRAFT' && !!context,
  });

  const mutation = useMutation({
    mutationFn: () => homeworkApi.patch(homeworkId, { status: transition!.status }),
    onSuccess: async () => {
      await invalidateHomework(cache, schoolId, homeworkId, true);
      setConfirming(false);
    },
  });

  if (!transition) return null;

  const blocked =
    !!context &&
    status === 'DRAFT' &&
    (targets.isPending || targets.isError || !targets.data?.length);

  const dismiss = () => {
    if (mutation.isPending) return;
    setConfirming(false);
    mutation.reset();
  };

  return (
    <>
      <Button className="hw-primary" type="button" onClick={() => setConfirming(true)}>
        {text(transition.label)}
      </Button>
      <Modal
        open={confirming}
        title={t.lifecycleTitle(text(transition.label))}
        description={text(transition.description)}
        onClose={dismiss}
      >
        <div className="hw-workspace space-y-4">
          {context}
          {status === 'DRAFT' ? (
            <>
              <p className="hw-context">{ui('immutable')}</p>
              {context ? (
                <section>
                  <h3>{t.targets}</h3>
                  {targets.isPending ? (
                    <p role="status">{t.loading}</p>
                  ) : targets.isError ? (
                    <InlineFeedback kind="error">
                      {t.unavailable}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void targets.refetch()}
                      >
                        {t.retry}
                      </Button>
                    </InlineFeedback>
                  ) : targets.data?.length ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {targets.data.map((target) => (
                        <li className="hw-context" key={target.id}>
                          {classes.find((c) => c.id === target.classId)?.name ?? '—'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t.noTargets}</p>
                  )}
                </section>
              ) : null}
            </>
          ) : null}
          {mutation.isError ? (
            <InlineFeedback kind="error">
              {text(homeworkErrorMessage(mutation.error))}
            </InlineFeedback>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={dismiss}>
              {t.cancel}
            </Button>
            <Button
              className="hw-primary"
              type="button"
              disabled={mutation.isPending || blocked}
              onClick={() => mutation.mutate()}
            >
              {common('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
