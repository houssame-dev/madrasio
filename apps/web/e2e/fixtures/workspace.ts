import type { WorkspaceContext } from '../../lib/frontend/dashboard/admin-types';
import type { tuitionOverview } from '../../lib/modules/finance/application/overview';

/** Shared profile read; module fixtures still reject every unknown API route. */
export const workspaceContext = {
  date: '2026-10-27',
  timezone: 'Africa/Casablanca',
  academicYear: null,
} satisfies WorkspaceContext;

export const emptyFinanceOverview = {
  today: '2026-10-27', timezone: 'UTC', currency: 'MAD',
  summary: { students: 0, overdueStudents: 0, netCents: 0, paidCents: 0, outstandingCents: 0, notOverdueCents: 0, days1to30Cents: 0, days31to60Cents: 0, days61plusCents: 0 },
  collections: { netCents: 0, cashCents: 0, bankCents: 0, chequeCents: 0 },
  recent: [], overdue: [], byClass: [],
} satisfies Awaited<ReturnType<typeof tuitionOverview>>;
