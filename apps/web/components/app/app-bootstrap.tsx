'use client';

import type { ReactNode } from 'react';

import { ApiClientError } from '@/lib/frontend/api-client';
import { copy } from '@/lib/frontend/copy';
import { useCurrentUser } from '@/lib/frontend/current-user';
import { AccessDeniedState, ApiErrorState, NoSchoolState, PageLoading } from '@/components/ui/states';
import { AppShell } from './app-shell';
import { SchoolSelectionPanel } from './school-selector';

export function AppBootstrap({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) return <PageLoading />;

  if (currentUser.isError) {
    const error = currentUser.error;
    if (error instanceof ApiClientError && error.status === 401) {
      return <main className="flex min-h-screen items-center p-4"><AccessDeniedState title={copy.signInRequired} description={copy.signInRequiredDescription} /></main>;
    }
    if (error instanceof ApiClientError && error.status === 403) {
      return <main className="flex min-h-screen items-center p-4"><AccessDeniedState /></main>;
    }
    return <main className="flex min-h-screen items-center p-4"><ApiErrorState onRetry={() => void currentUser.refetch()} /></main>;
  }

  if (!currentUser.data.currentSchool) {
    if (currentUser.data.memberships.length === 0) {
      return <main className="flex min-h-screen items-center p-4"><NoSchoolState /></main>;
    }
    return <SchoolSelectionPanel memberships={currentUser.data.memberships} />;
  }

  return <AppShell context={currentUser.data}>{children}</AppShell>;
}
