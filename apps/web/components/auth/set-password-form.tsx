'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import {
  setPasswordSchema, type SetPasswordValues,
} from '@/lib/frontend/auth/set-password-schema';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useBeginAccountTransition } from '@/components/language/account-lifetime-host';
import { useTranslations } from 'next-intl';

export function SetPasswordForm() {
  const t = useTranslations('recovery');
  const password = useTranslations('password');
  const validation = useTranslations('validation');
  const queryClient = useQueryClient();
  const beginAccountTransition = useBeginAccountTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState<string>();
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submit(values: SetPasswordValues) {
    const finishTransition = beginAccountTransition();
    setError(undefined);
    try {
      const result = await getBrowserSupabase().auth.updateUser({ password: values.password });
      if (result.error) throw new Error('Password update failed.');
    } catch {
      setError(t('passwordFailure'));
      form.setFocus('password');
      return;
    } finally {
      finishTransition();
    }
    queryClient.clear();
    navigateAfterAuth('/dashboard');
  }

  return (
    <form method="post" noValidate onSubmit={form.handleSubmit(submit)}>
      {/* Native controls must stay inert until the controlled Auth handler is ready. */}
      <fieldset className="space-y-4" disabled={!isHydrated}>
        {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
        <Field label={password('newPassword')} htmlFor="new-password" error={form.formState.errors.password ? validation(form.formState.errors.password.type === 'too_big' ? 'passwordLong' : 'passwordShort') : undefined}>
          <input id="new-password" type="password" autoComplete="new-password" className={inputClassName} {...form.register('password')} />
        </Field>
        <Field label={password('confirmation')} htmlFor="confirm-password" error={form.formState.errors.confirmation ? validation('passwordMismatch') : undefined}>
          <input id="confirm-password" type="password" autoComplete="new-password" className={inputClassName} {...form.register('confirmation')} />
        </Field>
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {form.formState.isSubmitting ? password('pending') : password('submit')}
        </Button>
      </fieldset>
      <noscript>{password('javascript')}</noscript>
    </form>
  );
}
