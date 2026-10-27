'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
  LoaderCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@school/ui';
import { Field, InlineFeedback } from '@/components/academic/ui';
import { LanguageSelector } from '@/components/language/language-selector';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { useTranslations } from 'next-intl';
import { loginSchema, type LoginValues } from '@/lib/frontend/auth/schemas';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useBeginAccountTransition } from '@/components/language/account-lifetime-host';
import { BrandMark } from '@/components/branding/brand-mark';

export function LoginForm() {
  const t = useTranslations('auth');
  const visual = useTranslations('authShowcase');
  const [showPassword, setShowPassword] = useState(false);
  const validation = useTranslations('validation');
  const queryClient = useQueryClient();
  const beginAccountTransition = useBeginAccountTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

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
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-welcome" aria-labelledby="welcome-title">
          <BrandMark className="auth-brand" priority />
          <h1 id="welcome-title">
            {visual('welcome')}
            <br />
            <bdi>Madrasio</bdi>
          </h1>
          <p className="auth-desktop-intro">{visual('desktopIntro')}</p>
          <p className="auth-mobile-intro">{visual('mobileIntro')}</p>
          <ul className="auth-benefits">
            {(
              [
                [UsersRound, 'operationsTitle', 'operationsBody'],
                [BarChart3, 'connectedTitle', 'connectedBody'],
                [ShieldCheck, 'futureTitle', 'futureBody'],
              ] as const
            ).map(([Icon, title, body]) => (
              <li key={title}>
                <span className="auth-benefit-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h2>{visual(title)}</h2>
                  <p>{visual(body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="auth-card" aria-labelledby="login-title">
          <header className="auth-card-heading">
            <h2 id="login-title">{visual('formTitle')}</h2>
            <p>{visual('formIntro')}</p>
          </header>
          <div className="auth-preferences">
            <LanguageSelector auth />
            <ThemeSelector auth />
          </div>
          <form method="post" noValidate onSubmit={form.handleSubmit(submit)}>
            <fieldset className="auth-fields" disabled={!isHydrated || form.formState.isSubmitting}>
              {formError ? <InlineFeedback kind="error">{formError}</InlineFeedback> : null}
              <Field
                label={t('email')}
                htmlFor="login-email"
                error={
                  form.formState.errors.email
                    ? validation(
                        form.formState.errors.email.type === 'too_small'
                          ? 'emailRequired'
                          : 'emailInvalid',
                      )
                    : undefined
                }
              >
                <div className="auth-input-wrap">
                  <Mail aria-hidden="true" />
                  <input
                    id="login-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    autoCapitalize="none"
                    placeholder={visual('emailPlaceholder')}
                    className="auth-input"
                    aria-invalid={!!form.formState.errors.email}
                    aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined}
                    {...form.register('email')}
                  />
                </div>
              </Field>
              <Field
                label={t('password')}
                htmlFor="login-password"
                error={form.formState.errors.password ? validation('passwordRequired') : undefined}
              >
                <div className="auth-input-wrap">
                  <LockKeyhole aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={visual('passwordPlaceholder')}
                    className="auth-input auth-password"
                    aria-invalid={!!form.formState.errors.password}
                    aria-describedby={
                      form.formState.errors.password ? 'login-password-error' : undefined
                    }
                    {...form.register('password')}
                  />
                  <button
                    className="auth-reveal"
                    type="button"
                    aria-label={visual(showPassword ? 'hidePassword' : 'showPassword')}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                  </button>
                </div>
              </Field>
              <div className="auth-recovery">
                <Link href="/auth/recover">{visual('forgot')}</Link>
              </div>
              <Button className="auth-submit" type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {form.formState.isSubmitting ? t('submitting') : t('submit')}
              </Button>
              {form.formState.isSubmitting ? (
                <span className="sr-only" role="status">
                  {t('submitting')}
                </span>
              ) : null}
            </fieldset>
          </form>
          <footer className="auth-privacy">
            <ShieldCheck aria-hidden="true" />
            <p>
              {visual('privacy')}
              <br />
              {visual('privacyDetail')}
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
