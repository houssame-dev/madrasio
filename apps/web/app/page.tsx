import { getServerSupabase } from '@/lib/supabase/server';

export default async function HomePage() {
  // Demonstrates server-side Supabase client wiring without performing any business action.
  // Foundation only — full authentication flows are out of scope for this task.
  const supabase = getServerSupabase();
  void supabase;

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          School Management System
        </h1>
        <p className="text-muted-foreground max-w-xl">
          V1 foundation. The technical scaffold (Next.js, TypeScript, Tailwind,
          shadcn/ui, Supabase, Drizzle, testing) is wired up. Business modules
          are not yet implemented.
        </p>
      </div>

      <a
        href="/api/health"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        GET /api/health
      </a>
    </main>
  );
}
