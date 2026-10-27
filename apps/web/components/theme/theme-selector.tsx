'use client';

import { useId } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { isThemePreference } from '@/lib/frontend/theme';
import { useTheme } from './theme-provider';

export function ThemeSelector({
  compact = false,
  auth = false,
}: {
  compact?: boolean;
  auth?: boolean;
}) {
  const { theme, ready, setTheme } = useTheme();
  const t = useTranslations('theme');
  const id = useId();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <div className={auth ? 'auth-selector' : 'relative shrink-0'}>
      <label htmlFor={id} className={auth ? 'auth-label' : 'sr-only'}>
        {t('label')}
      </label>
      <NativeSelect
        className={auth ? 'auth-select' : undefined}
        id={id}
        compact={compact}
        disabled={!ready}
        value={theme}
        title={`${t('label')}: ${t(theme)}`}
        onChange={(event) => {
          if (isThemePreference(event.target.value)) setTheme(event.target.value);
        }}
      >
        <NativeSelectOption value="light">{t('light')}</NativeSelectOption>
        <NativeSelectOption value="mist">{t('mist')}</NativeSelectOption>
        <NativeSelectOption value="midnight">{t('midnight')}</NativeSelectOption>
        <NativeSelectOption value="dark">{t('dark')}</NativeSelectOption>
        <NativeSelectOption value="system">{t('system')}</NativeSelectOption>
      </NativeSelect>
      {auth ? <Sun aria-hidden="true" className="auth-select-symbol" /> : null}
      {compact ? (
        <Icon aria-hidden="true" className="pointer-events-none absolute start-3 top-3 size-4" />
      ) : null}
    </div>
  );
}
