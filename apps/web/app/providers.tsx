'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

import { ApiClientError } from '@/lib/frontend/api-client';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          if (error instanceof ApiClientError && error.status < 500) return false;
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * App-level providers.
 *
 * Foundation only — no domain-specific providers are wired in here yet.
 * This file exists to give us a single place to attach client-side providers
 * (TanStack Query, theme, etc.) without scattering them across the tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
