'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog, InlineFeedback } from '@/components/academic/ui';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
import { gradeErrorMessage } from '@/lib/frontend/grades/errors';
import { invalidateResult } from '@/lib/frontend/grades/queries';
import type { ResultDto } from '@/lib/frontend/grades/types';

type Action = 'FINALIZE' | 'PUBLISH' | 'REVISE';

export function ResultActions({ schoolId, result, onChanged }: {
  schoolId: string;
  result: ResultDto;
  onChanged: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ action: Action; key?: string }>();
  const mutation = useMutation({
    mutationFn: async (choice: { action: Action; key?: string }) => {
      if (choice.action === 'FINALIZE') return gradesApi.finalizeResult(result.resultType, result.id);
      if (choice.action === 'PUBLISH') return gradesApi.publishResult(result.resultType, result.id, choice.key!);
      return gradesApi.reviseResult(result.resultType, result.id, choice.key!);
    },
    onSuccess: async (_value, choice) => {
      await invalidateResult(queryClient, schoolId, result.resultType, result.id);
      onChanged(choice.action === 'FINALIZE' ? t.resultFinalized : choice.action === 'PUBLISH' ? t.resultPublished : t.resultRevised);
      setSelected(undefined);
    },
  });
  const choose = (action: Action) => setSelected({ action, key: action === 'FINALIZE' ? undefined : crypto.randomUUID() });
  const title = selected?.action === 'FINALIZE' ? t.finalizeTitle : selected?.action === 'PUBLISH' ? t.publishResultTitle : t.reviseTitle;
  const description = selected?.action === 'FINALIZE' ? t.finalizeDescription : selected?.action === 'PUBLISH' ? t.publishResultDescription : t.reviseDescription;
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">{result.status === 'CALCULATED' ? <Button type="button" onClick={() => choose('FINALIZE')}>{t.finalize}</Button> : <><Button type="button" onClick={() => choose('PUBLISH')}>{t.publishResult}</Button><Button type="button" variant="outline" onClick={() => choose('REVISE')}>{t.reviseResult}</Button></>}</div>
    {mutation.isError && !selected ? <InlineFeedback kind="error">{gradeErrorMessage(mutation.error)}</InlineFeedback> : null}
    <ConfirmDialog open={!!selected} title={title} description={description} pending={mutation.isPending} error={mutation.isError ? gradeErrorMessage(mutation.error) : undefined} onClose={() => { setSelected(undefined); mutation.reset(); }} onConfirm={() => selected && mutation.mutate(selected)} />
  </div>;
}
