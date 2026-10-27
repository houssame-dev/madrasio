'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LockKeyhole, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { setPasswordSchema, type SetPasswordValues } from '@/lib/frontend/auth/set-password-schema';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useBeginAccountTransition } from '@/components/language/account-lifetime-host';
import { useTranslations } from 'next-intl';

export function SetPasswordForm({
  presentation = 'default',
}: {
  presentation?: 'default' | 'showcase';
}) {
  const t = useTranslations('recovery');
  const visual = useTranslations('passwordShowcase');
  const showcase = presentation === 'showcase';
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      <fieldset className={showcase ? 'auth-fields' : 'space-y-4'} disabled={!isHydrated}>
        {error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}
        <Field
          label={password('newPassword')}
          htmlFor="new-password"
          error={
            form.formState.errors.password
              ? validation(
                  form.formState.errors.password.type === 'too_big'
                    ? 'passwordLong'
                    : 'passwordShort',
                )
              : undefined
          }
        >
          <div className={showcase ? 'auth-input-wrap' : undefined}>
            {showcase ? <LockKeyhole aria-hidden="true" /> : null}
            <input
              id="new-password"
              type={showNew ? 'text' : 'password'}
              dir="auto"
              autoComplete="new-password"
              placeholder={showcase ? visual('newPlaceholder') : undefined}
              className={showcase ? 'auth-input password-input' : inputClassName}
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={form.formState.errors.password ? 'new-password-error' : undefined}
              {...form.register('password')}
            />
            {showcase ? (
              <button
                type="button"
                className="auth-reveal"
                aria-label={visual(showNew ? 'hideNew' : 'showNew')}
                aria-pressed={showNew}
                onClick={() => setShowNew((value) => !value)}
              >
                {showNew ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              </button>
            ) : null}
          </div>
        </Field>
        <Field
          label={password('confirmation')}
          htmlFor="confirm-password"
          hint={showcase ? validation('passwordShort') : undefined}
          error={form.formState.errors.confirmation ? validation('passwordMismatch') : undefined}
        >
          <div className={showcase ? 'auth-input-wrap' : undefined}>
            {showcase ? <LockKeyhole aria-hidden="true" /> : null}
            <input
              id="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              dir="auto"
              autoComplete="new-password"
              placeholder={showcase ? visual('confirmPlaceholder') : undefined}
              className={showcase ? 'auth-input password-input' : inputClassName}
              aria-invalid={!!form.formState.errors.confirmation}
              aria-describedby={
                [
                  showcase ? 'confirm-password-hint' : '',
                  form.formState.errors.confirmation ? 'confirm-password-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              {...form.register('confirmation')}
            />
            {showcase ? (
              <button
                type="button"
                className="auth-reveal"
                aria-label={visual(showConfirm ? 'hideConfirm' : 'showConfirm')}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              </button>
            ) : null}
          </div>
        </Field>
        <Button
          className={showcase ? 'auth-submit' : 'w-full'}
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {form.formState.isSubmitting
            ? password('pending')
            : showcase
              ? visual('submit')
              : password('submit')}
        </Button>
        {showcase && form.formState.isSubmitting ? (
          <span className="sr-only" role="status">
            {password('pending')}
          </span>
        ) : null}
      </fieldset>
      <noscript>{password('javascript')}</noscript>
    </form>
  );
}
