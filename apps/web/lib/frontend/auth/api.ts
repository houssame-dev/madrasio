import { apiRequest } from '@/lib/frontend/api-client';

interface LogoutResponse {
  data: { signedOut: true };
}

export async function postLogout(): Promise<void> {
  await apiRequest<LogoutResponse>('/api/v1/auth/logout', { method: 'POST' });
}
