import type { ReactNode } from 'react';

import { AppBootstrap } from '@/components/app/app-bootstrap';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppBootstrap>{children}</AppBootstrap>;
}
