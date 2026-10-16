'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AccessDeniedState } from '@/components/ui/states';
import { LogoutButton } from '@/components/auth/logout-button';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';

export function PlatformDeniedPresentation() {
  const t = useTranslations('platformUi');
  return <main className="p-6"><AccessDeniedState description={t('denied')} action={<LogoutButton />} /></main>;
}

/** Only rendered after the existing server authority guard has succeeded. */
export function PlatformPresentation({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return <div className="min-h-screen p-4 md:p-8">
    <nav aria-label={t('platformUi.navigation')} className="mb-6 flex flex-wrap items-center gap-4">
      <Link className="underline" href="/platform/schools">{t('navigation.items.platformSchools')}</Link>
      <Link className="underline" href="/dashboard">{t('platformUi.workspace')}</Link>
      <LogoutButton /><LanguagePreferenceSlot placement="platform" />
    </nav>
    {children}
  </div>;
}
