import Link from 'next/link';
import { RecoveryForm } from '@/components/auth/recovery-form';
import { recoveryCopy as t } from '@/lib/frontend/auth/recovery-copy';

export default function RecoveryPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section
        className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6"
        aria-labelledby="recovery-title"
      >
        <h1 id="recovery-title" className="text-2xl font-semibold">
          {t.title}
        </h1>
        <p>{t.description}</p>
        <RecoveryForm />
        <Link href="/login" className="text-primary underline">
          {t.back}
        </Link>
      </section>
    </main>
  );
}
