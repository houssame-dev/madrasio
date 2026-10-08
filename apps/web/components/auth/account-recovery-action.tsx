'use client';
import { useState } from 'react';
import { Button } from '@school/ui';
import { InlineFeedback } from '@/components/academic/ui';
import { ApiClientError, apiRequest } from '@/lib/frontend/api-client';
import { recoveryCopy as t } from '@/lib/frontend/auth/recovery-copy';

export function AccountRecoveryAction({
  kind,
  profileId,
}: {
  kind: 'teachers' | 'parents';
  profileId: string;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-muted-foreground">{t.assistDescription}</p>
      {sent ? <InlineFeedback kind="success">{t.assistSuccess}</InlineFeedback> : null}
      {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending || sent}
        onClick={async () => {
          setPending(true);
          setError(undefined);
          try {
            await apiRequest(`/api/v1/${kind}/${profileId}/recover-account`, {
              method: 'POST',
              body: '{}',
            });
            setSent(true);
          } catch (error) {
            setError(
              error instanceof ApiClientError && error.featureCode === 'ACCOUNT_RECOVERY_COOLDOWN'
                ? t.cooldown
                : t.assistFailure,
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? t.pending : t.assist}
      </Button>
    </div>
  );
}
