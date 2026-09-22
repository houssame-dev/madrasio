import type { ReactNode } from 'react';

import type { Permission } from './permissions';
import { roleHasPermission } from './permissions';
import type { Role } from './roles';

export interface CanProps {
  role: Role | null | undefined;
  permission: Permission;
  children: ReactNode;
}

/**
 * UX-only permission gate (PRD.md §40, Task 005 §19).
 *
 * Hides UI when the current role lacks a permission. It is NOT a security
 * boundary: the server always re-checks authorization. Stateless and
 * server-compatible — the role is passed in from the caller's context.
 */
export function Can({ role, permission, children }: CanProps) {
  if (!roleHasPermission(role, permission)) return null;
  return <>{children}</>;
}