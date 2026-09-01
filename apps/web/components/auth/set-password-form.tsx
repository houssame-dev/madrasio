'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import {
  setPasswordSchema, type SetPasswordValues,
} from '@/lib/frontend/auth/set-password-schema';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SetPasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  async function submit(values: SetPasswordValues) {
    setError(undefined);
    const result = await getBrowserSupabase().auth.updateUser({ password: values.password });
    if (result.error) {
      setError('Your password could not be set. Request a new invitation from your School administrator.');
      form.setFocus('password');
      return;
    }
    queryClient.clear();
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
      {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
      <Field label="New password" htmlFor="new-password" error={form.formState.errors.password?.message}>
        <input id="new-password" type="password" autoComplete="new-password" className={inputClassName} {...form.register('password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm-password" error={form.formState.errors.confirmation?.message}>
        <input id="confirm-password" type="password" autoComplete="new-password" className={inputClassName} {...form.register('confirmation')} />
      </Field>
      <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {form.formState.isSubmitting ? 'Saving password…' : 'Set password'}
      </Button>
    </form>
  );
}

