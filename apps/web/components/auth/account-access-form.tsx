'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { ApiClientError } from '@/lib/frontend/api-client';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.').max(320) });
type Values = z.input<typeof schema>;

export function AccountAccessForm({
  invite, onCancel, onLinked,
}: {
  invite: (email: string) => Promise<unknown>;
  onCancel: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const t = useTranslations('accountAccess');
  const validation = useTranslations('validation');
  function message(error: unknown): string {
    if (error instanceof ApiClientError) {
      switch (error.featureCode) {
        case 'PROFILE_NOT_FOUND': return t('PROFILE_NOT_FOUND');
        case 'PROFILE_NOT_ACTIVE': return t('PROFILE_NOT_ACTIVE');
        case 'PROFILE_ACCOUNT_ALREADY_LINKED': return t('PROFILE_ACCOUNT_ALREADY_LINKED');
        case 'ACCOUNT_ROLE_CONFLICT': return t('ACCOUNT_ROLE_CONFLICT');
        case 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED': return t('ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED');
        case 'ACCOUNT_INVITE_FAILED': return t('ACCOUNT_INVITE_FAILED');
        case 'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED': return t('ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED');
      }
    }
    return t('failed');
  }
  const [error, setError] = useState<string>();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const mutation = useMutation({
    mutationFn: (values: Values) => invite(values.email),
    onSuccess: async () => { setError(undefined); await onLinked(); },
    onError: (value) => { setError(message(value)); form.setFocus('email'); },
  });
  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit((value) => mutation.mutate(value))}>
      {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
      <Field label={t('email')} htmlFor="account-email" error={form.formState.errors.email ? (form.formState.errors.email.type === 'too_big' ? validation('emailTooLong', { maximum: 320 }) : validation('emailInvalid')) : undefined} hint={t('hint')}>
        <input id="account-email" type="email" dir="ltr" autoComplete="email" autoCapitalize="none" className={inputClassName} {...form.register('email')} />
      </Field>
      <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={t('submit')} />
    </form>
  );
}

