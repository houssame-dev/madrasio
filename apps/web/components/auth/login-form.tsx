'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { authCopy as t } from '@/lib/frontend/auth/copy';
import { loginSchema, type LoginValues } from '@/lib/frontend/auth/schemas';
import { copy } from '@/lib/frontend/copy';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function LoginForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  async function submit(values: LoginValues) {
    setFormError(undefined);
    try {
      const { error } = await getBrowserSupabase().auth.signInWithPassword(values);
      if (error) {
        setFormError(error.status === 400 ? t.invalidCredentials : t.signInUnavailable);
        form.setFocus('email');
        return;
      }
      queryClient.clear();
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setFormError(t.signInUnavailable);
      form.setFocus('email');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="login-title">
        <div className="mb-6 flex items-start gap-3">
          <span className="rounded-md bg-primary p-2 text-primary-foreground" aria-hidden="true"><Building2 className="size-5" /></span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{copy.productName}</p>
            <h1 id="login-title" className="text-2xl font-semibold">{t.loginTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.loginDescription}</p>
          </div>
        </div>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
          {formError ? <InlineFeedback kind="error">{formError}</InlineFeedback> : null}
          <Field label={t.email} htmlFor="login-email" error={form.formState.errors.email?.message}>
            <input id="login-email" type="email" autoComplete="email" autoCapitalize="none" className={inputClassName} aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined} {...form.register('email')} />
          </Field>
          <Field label={t.password} htmlFor="login-password" error={form.formState.errors.password?.message}>
            <input id="login-password" type="password" autoComplete="current-password" className={inputClassName} aria-invalid={!!form.formState.errors.password} aria-describedby={form.formState.errors.password ? 'login-password-error' : undefined} {...form.register('password')} />
          </Field>
          <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {form.formState.isSubmitting ? t.submitting : t.submit}
          </Button>
          {form.formState.isSubmitting ? <span className="sr-only" role="status">{t.submitting}</span> : null}
        </form>
      </section>
    </main>
  );
}
