'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { ApiClientError } from '@/lib/frontend/api-client';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.').max(320) });
type Values = z.input<typeof schema>;

const messages: Record<string, string> = {
  PROFILE_NOT_FOUND: 'This profile is unavailable in the current School.',
  PROFILE_NOT_ACTIVE: 'Activate the profile before inviting account access.',
  PROFILE_ACCOUNT_ALREADY_LINKED: 'This profile already has account access.',
  ACCOUNT_ROLE_CONFLICT: 'This account already has an incompatible role in this School.',
  ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED: 'This identity requires operator reconciliation before it can be linked.',
  ACCOUNT_INVITE_FAILED: 'The invitation could not be initiated. Contact an operator if this email already has an account.',
  ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED: 'Provisioning needs operator reconciliation. No further attempts should be made yet.',
};

function message(error: unknown) {
  if (!(error instanceof ApiClientError)) return 'The invitation could not be completed. Please try again.';
  return messages[error.featureCode ?? ''] ?? (error.status < 500 ? error.message : 'The invitation could not be completed. Please try again.');
}

export function AccountAccessForm({
  invite, onCancel, onLinked,
}: {
  invite: (email: string) => Promise<unknown>;
  onCancel: () => void;
  onLinked: () => Promise<void> | void;
}) {
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
      <Field label="Email" htmlFor="account-email" error={form.formState.errors.email?.message} hint="The role is derived from this profile and cannot be selected here.">
        <input id="account-email" type="email" autoComplete="email" autoCapitalize="none" className={inputClassName} {...form.register('email')} />
      </Field>
      <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel="Invite account" />
    </form>
  );
}

