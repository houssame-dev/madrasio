import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppContextProvider } from '@/components/app/app-context';
import type { Role } from '@/lib/authorization/roles';
import type { NotificationDto } from '@/lib/frontend/notifications/types';

export const schoolId = '00000000-0000-4000-8000-000000000901';
export const otherSchoolId = '00000000-0000-4000-8000-000000000902';
export const userId = '00000000-0000-4000-8000-000000000903';
export const notificationId = '00000000-0000-4000-8000-000000000904';

export const notification: NotificationDto = {
  id: notificationId,
  notificationType: 'ANNOUNCEMENT_PUBLISHED',
  sourceType: 'ANNOUNCEMENT_PUBLICATION',
  sourceId: '00000000-0000-4000-8000-000000000905',
  title: 'School closure',
  body: 'The school will close tomorrow.',
  readAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
};

export const page = (data: NotificationDto[]) => ({ data, meta: { page: 1, pageSize: 20, total: data.length } });

export function renderNotifications(ui: ReactElement, role: Role = 'PARENT'): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AppContextProvider value={{ user: { id: userId }, currentSchool: { id: schoolId, role }, memberships: [{ schoolId, schoolName: 'Atlas School', role, status: 'ACTIVE' }] }}>
        {ui}
      </AppContextProvider>
    </QueryClientProvider>,
  );
  return Object.assign(result, { queryClient });
}
