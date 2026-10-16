'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, LogOut } from 'lucide-react';

import { Button } from '@school/ui';
import { postLogout } from '@/lib/frontend/auth/api';
import { useTranslations } from 'next-intl';
import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useBeginAccountTransition } from '@/components/language/account-lifetime-host';

export function LogoutButton({ variant = 'outline', compact = false }: { variant?: 'ghost' | 'outline'; compact?: boolean }) {
  const t = useTranslations('auth');
  const queryClient = useQueryClient();
  const beginAccountTransition = useBeginAccountTransition();
  const logout = useMutation({
    mutationFn: async (finishTransition: () => void) => {
      try { await postLogout(); } finally { finishTransition(); }
    },
    onSuccess() {
      queryClient.clear();
      navigateAfterAuth('/login');
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={variant} size={compact ? 'icon' : 'default'} aria-label={compact ? (logout.isPending ? t('loggingOut') : t('logout')) : undefined} disabled={logout.isPending} onClick={() => { if (!logout.isPending) logout.mutate(beginAccountTransition()); }}>
        {logout.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4 rtl:rotate-180" aria-hidden="true" />}
        {compact ? <span className="sr-only">{logout.isPending ? t('loggingOut') : t('logout')}</span> : logout.isPending ? t('loggingOut') : t('logout')}
      </Button>
      {logout.isPending ? <span className="sr-only" role="status">{t('loggingOut')}</span> : null}
      {logout.isError ? <span className="text-xs text-destructive" role="alert">{t('logoutFailed')}</span> : null}
    </div>
  );
}
