import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUserId } from '@/lib/auth/server-auth';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { getDb } from '@/lib/db/client';
import { AppError } from '@/lib/errors';
import { AccessDeniedState } from '@/components/ui/states';
import { LogoutButton } from '@/components/auth/logout-button';

export const dynamic = 'force-dynamic';
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  try {
    await requirePlatformAuthority(getDb(), await getAuthenticatedUserId());
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect('/login');
    if (error instanceof AppError && error.status === 403)
      return (
        <main className="p-6">
          <AccessDeniedState
            description="Platform administration is not available for this account."
            action={<LogoutButton />}
          />
        </main>
      );
    throw error;
  }
  return (
    <div className="min-h-screen p-4 md:p-8">
      <nav aria-label="Platform navigation" className="mb-6 flex flex-wrap items-center gap-4">
        <Link className="underline" href="/platform/schools">
          Platform Schools
        </Link>
        <Link className="underline" href="/dashboard">
          School workspace
        </Link>
        <LogoutButton />
      </nav>
      {children}
    </div>
  );
}
