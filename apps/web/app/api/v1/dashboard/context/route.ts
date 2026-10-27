import { readDashboard } from '@/lib/api/dashboard';
export function GET(request: Request) { return readDashboard(request, true); }
export const dynamic = 'force-dynamic';
