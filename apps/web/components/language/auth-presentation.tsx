'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RecoveryForm } from '@/components/auth/recovery-form';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { LanguageSelector } from './language-selector';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { BrandMark } from '@/components/branding/brand-mark';
import { ChevronLeft, LockKeyhole, Mail, ShieldAlert, ShieldCheck, UsersRound } from 'lucide-react';

export function RecoveryPresentation() {
  const t = useTranslations('recoveryShowcase');
  const shared = useTranslations('authShowcase');
  return (
    <main className="auth-page auth-recover">
      <div className="auth-shell">
        <section className="auth-welcome" aria-labelledby="recovery-title">
          <BrandMark className="auth-brand" priority />
          <h1 id="recovery-title">
            <span className="recovery-desktop-title">
              {t('heroFirst')}
              <br />
              {t('heroLast')}
            </span>
            <span className="recovery-mobile-title">{t('title')}</span>
          </h1>
          <p className="auth-desktop-intro">{t('heroIntro')}</p>
          <p className="auth-mobile-intro">{t('description')}</p>
          <ul className="auth-benefits">
            {(
              [
                [Mail, 'secureTitle', 'secureBody'],
                [ShieldCheck, 'safeTitle', 'safeBody'],
                [UsersRound, 'learningTitle', 'learningBody'],
              ] as const
            ).map(([Icon, title, body]) => (
              <li key={title}>
                <span className="auth-benefit-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h2>{t(title)}</h2>
                  <p>{t(body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="auth-card" aria-label={t('title')}>
          <header className="auth-card-heading">
            <h2>{t('title')}</h2>
            <p>{t('description')}</p>
          </header>
          <div className="auth-preferences">
            <LanguageSelector auth label={t('language')} />
            <ThemeSelector auth />
          </div>
          <RecoveryForm presentation="showcase" />
          <div className="recovery-back">
            <Link href="/login">
              <ChevronLeft aria-hidden="true" />
              {t('back')}
            </Link>
          </div>
          <footer className="auth-privacy">
            <ShieldCheck aria-hidden="true" />
            <p>
              {shared('privacy')}
              <br />
              {shared('privacyDetail')}
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}

/** The unchanged server session check alone controls whether the form mounts. */
export function SetPasswordPresentation({ invalid }: { invalid: boolean }) {
  const t = useTranslations('recovery');
  const visual = useTranslations('passwordShowcase');
  const shared = useTranslations('authShowcase');
  const controls = useTranslations('recoveryShowcase');
  return <main className="auth-page auth-recover auth-password">
    <div className="auth-shell">
      <section className="auth-welcome" aria-labelledby="password-title">
        <BrandMark className="auth-brand" priority />
        <h1 id="password-title"><span className="recovery-desktop-title">{invalid ? visual('invalidTitle') : <>{visual('heroFirst')}<br />{visual('heroLast')}</>}</span><span className="recovery-mobile-title">{visual(invalid ? 'invalidTitle' : 'mobileTitle')}</span></h1>
        <p className="auth-desktop-intro">{invalid ? visual('invalidHelp') : visual('description')}</p>
        <p className="auth-mobile-intro">{invalid ? visual('invalidHelp') : visual('description')}</p>
        <ul className="auth-benefits">
          {([[ShieldCheck, 'secureTitle', 'secureBody'], [LockKeyhole, 'accessTitle', 'accessBody'], [UsersRound, 'schoolTitle', 'schoolBody']] as const).map(([Icon, title, body]) => <li key={title}><span className="auth-benefit-icon"><Icon aria-hidden="true" /></span><div><h2>{visual(title)}</h2><p>{visual(body)}</p></div></li>)}
        </ul>
      </section>
      <section className="auth-card" aria-label={visual(invalid ? 'invalidTitle' : 'title')}>
        <header className="auth-card-heading"><h2>{visual(invalid ? 'invalidTitle' : 'title')}</h2><p>{visual(invalid ? 'invalidHelp' : 'description')}</p></header>
        <div className="auth-preferences"><LanguageSelector auth label={controls('language')} /><ThemeSelector auth /></div>
        {invalid ? <div className="password-invalid"><div role="status"><ShieldAlert aria-hidden="true" /><p>{t('invalid')}</p></div><Link className="auth-submit password-recover-link" href="/auth/recover">{t('title')}</Link></div> : <SetPasswordForm presentation="showcase" />}
        <div className="recovery-back"><Link href="/login"><ChevronLeft aria-hidden="true" />{controls('back')}</Link></div>
        <footer className="auth-privacy"><ShieldCheck aria-hidden="true" /><p>{shared('privacy')}<br />{shared('privacyDetail')}</p></footer>
      </section>
    </div>
  </main>;
}
