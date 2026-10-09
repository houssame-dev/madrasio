'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';

import { LogoutButton } from '@/components/auth/logout-button';
import { ApiClientError } from '@/lib/frontend/api-client';
import { authCopy } from '@/lib/frontend/auth/copy';
import { useCurrentUser } from '@/lib/frontend/current-user';
import { AccessDeniedState, ApiErrorState, NoSchoolState, PageLoading } from '@/components/ui/states';
import { AppShell } from './app-shell';
import { SchoolSelectionPanel } from './school-selector';

export function AppBootstrap({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const router = useRouter();
  const recoveringSession = useRef(false);
  const unauthenticated = currentUser.isError && currentUser.error instanceof ApiClientError && currentUser.error.status === 401;

  useEffect(() => {
    if (!unauthenticated || recoveringSession.current) return;
    recoveringSession.current = true;
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }, [queryClient, router, unauthenticated]);

  if (currentUser.isPending) return <PageLoading />;

  if (currentUser.isError) {
    const error = currentUser.error;
    if (error instanceof ApiClientError && error.status === 401) {
      return <PageLoading label={authCopy.sessionExpired} />;
    }
    if (error instanceof ApiClientError && error.status === 403) {
      const provisioning = error.featureCode === 'APPLICATION_USER_NOT_FOUND';
      return <main className="flex min-h-screen items-center p-4"><AccessDeniedState title={provisioning ? authCopy.accountProvisioning : authCopy.accountInactive} description={provisioning ? authCopy.accountProvisioningDescription : authCopy.accountInactiveDescription} action={<LogoutButton />} /></main>;
    }
    return <main className="flex min-h-screen items-center p-4"><ApiErrorState onRetry={() => void currentUser.refetch()} /></main>;
  }

  if (!currentUser.data.currentSchool) {
    if (currentUser.data.platformAuthority === 'SUPER_ADMIN') {
      return <main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Platform administration</h1><Link className="underline" href="/platform/schools">Manage Schools and School Admins</Link><LogoutButton /></main>;
    }
    if (currentUser.data.memberships.length === 0) {
      return <main className="flex min-h-screen items-center p-4"><NoSchoolState action={<LogoutButton />} /></main>;
    }
    return <SchoolSelectionPanel memberships={currentUser.data.memberships} />;
  }

  return <AppShell context={currentUser.data}>{children}</AppShell>;
}
