import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUserId } from '@/lib/auth/server-auth';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { getDb } from '@/lib/db/client';
import { AppError } from '@/lib/errors';
import { AuthenticatedAccountLifetimeHost } from '@/components/language/account-lifetime-host';
import { PlatformPresentation, PlatformDeniedPresentation } from '@/components/language/platform-presentation';

export const dynamic = 'force-dynamic';
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let verifiedUserId: string;
  try {
    ({ userId: verifiedUserId } = await requirePlatformAuthority(getDb(), await getAuthenticatedUserId()));
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect('/login');
    if (error instanceof AppError && error.status === 403) {
      return <PlatformDeniedPresentation />;
    }
    throw error;
  }
  return (
    <AuthenticatedAccountLifetimeHost verifiedUserId={verifiedUserId}>
      <PlatformPresentation>{children}</PlatformPresentation>
    </AuthenticatedAccountLifetimeHost>
  );
}
