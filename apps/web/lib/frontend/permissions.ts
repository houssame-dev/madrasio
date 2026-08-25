import { roleHasPermission, type Permission } from '@/lib/authorization/permissions';
import type { Role } from '@/lib/authorization/roles';

export const can = (role: Role | null | undefined, permission: Permission) =>
  roleHasPermission(role, permission);

export const canAny = (role: Role | null | undefined, permissions: readonly Permission[]) =>
  permissions.some((permission) => can(role, permission));

export const canAll = (role: Role | null | undefined, permissions: readonly Permission[]) =>
  permissions.every((permission) => can(role, permission));
