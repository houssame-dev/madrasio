'use client';

import { createContext, useContext } from 'react';

import type { MeResponseDto } from '@/lib/api/me';

const AppContext = createContext<MeResponseDto | null>(null);

export const AppContextProvider = AppContext.Provider;

export function useAppContext(): MeResponseDto {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppContext must be used inside the authenticated app shell.');
  return value;
}
