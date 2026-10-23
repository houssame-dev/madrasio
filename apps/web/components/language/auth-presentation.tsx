'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RecoveryForm } from '@/components/auth/recovery-form';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { LanguageSelector } from './language-selector';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { BrandMark } from '@/components/branding/brand-mark';

export function RecoveryPresentation() {
  const t = useTranslations('recovery');
  return <main className="flex min-h-screen items-center justify-center bg-background p-4">
    <section className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6" aria-labelledby="recovery-title">
      <div className="flex flex-wrap items-center justify-end gap-3"><ThemeSelector /><LanguageSelector compact /></div>
      <BrandMark className="h-12 w-48" priority />
      <h1 id="recovery-title" className="text-2xl font-semibold">{t('title')}</h1>
      <p>{t('description')}</p><RecoveryForm />
      <Link href="/login" className="text-primary underline">{t('back')}</Link>
    </section>
  </main>;
}

/** Boolean comes from the unchanged server Auth check; no raw error is passed. */
export function SetPasswordPresentation({ invalid }: { invalid: boolean }) {
  const t = useTranslations('recovery');
  const password = useTranslations('password');
  return <main className="flex min-h-screen items-center justify-center bg-background p-4">
    <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="password-title">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3"><ThemeSelector /><LanguageSelector compact /></div>
      <BrandMark className="mb-5 h-12 w-48" priority />
      <h1 id="password-title" className="text-2xl font-semibold">{password('title')}</h1>
      {invalid ? <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{t('invalid')}</p>
        <Link className="block text-sm text-primary underline" href="/auth/recover">{t('title')}</Link>
        <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/login">{t('back')}</Link>
      </div> : <div className="mt-4"><p className="mb-4 text-sm text-muted-foreground">{t('passwordIntro')}</p><SetPasswordForm /></div>}
    </section>
  </main>;
}
