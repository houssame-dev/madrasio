'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { useTranslations } from 'next-intl';
import { loginSchema, type LoginValues } from '@/lib/frontend/auth/schemas';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useBeginAccountTransition } from '@/components/language/account-lifetime-host';
import { BrandMark } from '@/components/branding/brand-mark';

export function LoginForm() {
  const t = useTranslations('auth');
  const recovery = useTranslations('recovery');
  const validation = useTranslations('validation');
  const queryClient = useQueryClient();
  const beginAccountTransition = useBeginAccountTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submit(values: LoginValues) {
    const finishTransition = beginAccountTransition();
    setFormError(undefined);
    try {
      const { error } = await getBrowserSupabase().auth.signInWithPassword(values);
      if (error) {
        setFormError(error.status === 400 ? t('invalidCredentials') : t('signInUnavailable'));
        form.setFocus('email');
        return;
      }
      queryClient.clear();
      navigateAfterAuth('/dashboard');
    } catch {
      setFormError(t('signInUnavailable'));
      form.setFocus('email');
    } finally {
      finishTransition();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="login-title">
        <div className="mb-6 space-y-5">
          <BrandMark className="h-12 w-48" priority />
          <div>
            <h1 id="login-title" className="text-2xl font-semibold">{t('loginTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('loginDescription')}</p>
          </div>
        </div>
        <form method="post" noValidate onSubmit={form.handleSubmit(submit)}>
          <fieldset className="space-y-4" disabled={!isHydrated}>
            {formError ? <InlineFeedback kind="error">{formError}</InlineFeedback> : null}
            <Field label={t('email')} htmlFor="login-email" error={form.formState.errors.email ? validation(form.formState.errors.email.type === 'too_small' ? 'emailRequired' : 'emailInvalid') : undefined}>
              <input id="login-email" type="email" dir="ltr" autoComplete="email" autoCapitalize="none" className={inputClassName} aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined} {...form.register('email')} />
            </Field>
            <Field label={t('password')} htmlFor="login-password" error={form.formState.errors.password ? validation('passwordRequired') : undefined}>
              <input id="login-password" type="password" autoComplete="current-password" className={inputClassName} aria-invalid={!!form.formState.errors.password} aria-describedby={form.formState.errors.password ? 'login-password-error' : undefined} {...form.register('password')} />
            </Field>
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {form.formState.isSubmitting ? t('submitting') : t('submit')}
            </Button>
            {form.formState.isSubmitting ? <span className="sr-only" role="status">{t('submitting')}</span> : null}
          </fieldset>
        </form>
        <Link className="mt-4 block text-sm text-primary underline" href="/auth/recover">{recovery('title')}</Link>
      </section>
    </main>
  );
}
