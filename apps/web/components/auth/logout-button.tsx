'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@school/ui';
import { postLogout } from '@/lib/frontend/auth/api';
import { authCopy as t } from '@/lib/frontend/auth/copy';

export function LogoutButton({ variant = 'outline', compact = false }: { variant?: 'ghost' | 'outline'; compact?: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const logout = useMutation({
    mutationFn: postLogout,
    onSuccess() {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={variant} size={compact ? 'icon' : 'default'} aria-label={compact ? (logout.isPending ? t.loggingOut : t.logout) : undefined} disabled={logout.isPending} onClick={() => logout.mutate()}>
        {logout.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
        {compact ? <span className="sr-only">{logout.isPending ? t.loggingOut : t.logout}</span> : logout.isPending ? t.loggingOut : t.logout}
      </Button>
      {logout.isPending ? <span className="sr-only" role="status">{t.loggingOut}</span> : null}
      {logout.isError ? <span className="text-xs text-destructive" role="alert">{t.logoutFailed}</span> : null}
    </div>
  );
}
