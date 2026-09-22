/**
 * V1 role model (BR-ROLE-001, domain-model §4).
 *
 * There is intentionally NO Student role in V1 (BR-AUTH-002, domain-model §74).
 * Roles are explicit, type-safe constants — never bare string literals
 * scattered through the codebase (PRD.md §6: no scattered `role === 'X'`
 * checks). Roles are combined with Permission, School Membership, Academic
 * Scope, Ownership, Relationships and Resource State; role alone is never
 * sufficient (BR-ROLE-002).
 */
export const ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}