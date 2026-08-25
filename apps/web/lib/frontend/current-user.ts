'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import type { MeResponseDto } from '@/lib/api/me';
import { apiRequest } from './api-client';
import { clearCacheForSchoolSwitch, queryKeys } from './query';

interface DataEnvelope<T> {
  data: T;
}

export async function fetchCurrentUser(): Promise<MeResponseDto> {
  return (await apiRequest<DataEnvelope<MeResponseDto>>('/api/v1/me')).data;
}

export const currentUserQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.me, queryFn: fetchCurrentUser, staleTime: 30_000 });

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

export async function postCurrentSchool(schoolId: string): Promise<MeResponseDto> {
  return (
    await apiRequest<DataEnvelope<MeResponseDto>>('/api/v1/me/current-school', {
      method: 'POST',
      body: JSON.stringify({ schoolId }),
    })
  ).data;
}

export function useSelectCurrentSchool() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: postCurrentSchool,
    async onSuccess() {
      clearCacheForSchoolSwitch(queryClient);
      await queryClient.fetchQuery(currentUserQueryOptions());
      router.replace('/dashboard');
      router.refresh();
    },
  });
}
