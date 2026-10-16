'use client';

import { navigateAfterAuth } from '@/lib/frontend/language/auth-navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';

import { LogoutButton } from '@/components/auth/logout-button';
import { ApiClientError } from '@/lib/frontend/api-client';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/lib/frontend/current-user';
import { AccessDeniedState, ApiErrorState, NoSchoolState, PageLoading } from '@/components/ui/states';
import { AppShell } from './app-shell';
import { SchoolSelectionPanel } from './school-selector';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';
import { AuthenticatedAccountLifetimeHost } from '@/components/language/account-lifetime-host';

export function AppBootstrap({ children }: { children: ReactNode }) {
  const auth = useTranslations('auth');
  const workspace = useTranslations('workspace');
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const recoveringSession = useRef(false);
  const unauthenticated = currentUser.isError && currentUser.error instanceof ApiClientError && currentUser.error.status === 401;

  useEffect(() => {
    if (!unauthenticated || recoveringSession.current) return;
    recoveringSession.current = true;
    queryClient.clear();
    navigateAfterAuth('/login');
  }, [queryClient, unauthenticated]);

  if (currentUser.isPending) return <PageLoading />;

  if (currentUser.isError) {
    const error = currentUser.error;
    if (error instanceof ApiClientError && error.status === 401) {
      return <PageLoading label={auth('sessionExpired')} />;
    }
    if (error instanceof ApiClientError && error.status === 403) {
      const provisioning = error.featureCode === 'APPLICATION_USER_NOT_FOUND';
      return <main className="flex min-h-screen items-center p-4"><AccessDeniedState title={provisioning ? auth('accountProvisioning') : auth('accountInactive')} description={provisioning ? auth('accountProvisioningDescription') : auth('accountInactiveDescription')} action={<LogoutButton />} /></main>;
    }
    return <main className="flex min-h-screen items-center p-4"><ApiErrorState onRetry={() => void currentUser.refetch()} /></main>;
  }

  const verifiedUserId = currentUser.data.user.id;
  const host = (content: ReactNode) => <AuthenticatedAccountLifetimeHost verifiedUserId={verifiedUserId}>{content}</AuthenticatedAccountLifetimeHost>;
  if (!currentUser.data.currentSchool) {
    if (currentUser.data.platformAuthority === 'SUPER_ADMIN') {
      return host(<main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">{workspace('platformTitle')}</h1><Link className="underline" href="/platform/schools">{workspace('platformLink')}</Link><LanguagePreferenceSlot placement="platform-only" /><LogoutButton /></main>);
    }
    if (currentUser.data.memberships.length === 0) {
      return host(<main className="flex min-h-screen items-center p-4"><NoSchoolState action={<><LanguagePreferenceSlot placement="no-school" /><LogoutButton /></>} /></main>);
    }
    return host(<SchoolSelectionPanel memberships={currentUser.data.memberships} />);
  }

  return host(<AppShell context={currentUser.data}>{children}</AppShell>);
}
