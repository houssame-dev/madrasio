import { readDashboard } from '@/lib/api/dashboard';
export function GET(request: Request) { return readDashboard(request); }
export const dynamic = 'force-dynamic';
