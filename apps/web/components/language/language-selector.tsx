'use client';

import { Globe2 } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isSupportedLocale, localeDirection, resolveLocale } from '@school/shared';
import { setPresentationLocale } from '@/i18n/actions';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
] as const;

/** A browser preference for everyone; changing language opens a fresh document. */
export function LanguageSelector({
  compact = false,
  auth = false,
  label,
}: { compact?: boolean; auth?: boolean; label?: string } = {}) {
  const current = resolveLocale(useLocale());
  const t = useTranslations('languagePreference');
  const id = useId();
  const [selected, setSelected] = useState(current);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(value: string) {
    if (pending || !isSupportedLocale(value) || value === current) return;
    setSelected(value);
    setPending(true);
    setFailed(false);
    try {
      await setPresentationLocale(value);
      window.location.reload();
    } catch {
      setSelected(current);
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className={auth ? 'auth-selector' : compact ? 'relative shrink-0' : 'min-w-0 space-y-1'}>
      <label
        htmlFor={id}
        className={auth ? 'auth-label' : compact ? 'sr-only' : 'block text-sm font-medium'}
      >
        {label ?? t('label')}
      </label>
      <NativeSelect
        id={id}
        value={selected}
        disabled={pending}
        aria-busy={pending}
        className={
          auth
            ? 'auth-select'
            : `h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${compact ? 'w-24' : 'w-full'}`
        }
        title={failed ? t('saveUncertain') : t('label')}
        aria-invalid={failed || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          void change(event.target.value);
        }}
      >
        {languages.map(({ value, label }) => (
          <option key={value} value={value} lang={value} dir={localeDirection(value)}>
            {label}
          </option>
        ))}
      </NativeSelect>
      {auth ? <Globe2 aria-hidden="true" className="auth-select-symbol" /> : null}
      <p
        id={`${id}-hint`}
        className={compact || auth ? 'sr-only' : 'text-xs text-muted-foreground'}
      >
        {t('hint')}
      </p>
      {pending ? (
        <p role="status" className={compact || auth ? 'sr-only' : 'text-sm'}>
          {t('saving')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className={compact || auth ? 'sr-only' : 'text-sm'}>
          {t('saveUncertain')}
        </p>
      ) : null}
    </div>
  );
}
