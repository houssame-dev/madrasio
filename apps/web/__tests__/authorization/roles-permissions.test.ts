import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from '@/lib/authorization/permissions';
import { ROLES, isRole } from '@/lib/authorization/roles';

describe('roles — V1 role model (BR-ROLE-001)', () => {
  it('supports exactly the four V1 roles', () => {
    expect(ROLES).toEqual(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT']);
  });

  it('does not include STUDENT (BR-AUTH-002)', () => {
    expect(ROLES).not.toContain('STUDENT');
    expect(isRole('STUDENT')).toBe(false);
  });

  it('rejects unknown or malformed roles', () => {
    expect(isRole('TEACHER')).toBe(true);
    expect(isRole('SUPER_ADMIN')).toBe(true);
    expect(isRole('teacher')).toBe(false);
    expect(isRole('')).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('role → permission mapping (CLAUDE.md §6, Task 005 §6)', () => {
  it('every permission is a member of PERMISSIONS', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('maps each role to a deterministic, non-empty permission set', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('allows a school admin to manage students, teachers and publish grades', () => {
    expect(roleHasPermission('SCHOOL_ADMIN', 'students.manage')).toBe(true);
    expect(roleHasPermission('SCHOOL_ADMIN', 'teachers.manage')).toBe(true);
    expect(roleHasPermission('SCHOOL_ADMIN', 'grades.publish')).toBe(true);
    expect(roleHasPermission('SCHOOL_ADMIN', 'academic_structure.read')).toBe(true);
    expect(roleHasPermission('SCHOOL_ADMIN', 'academic_structure.manage')).toBe(true);
  });

  it('allows a teacher to enter grades within their assignment scope', () => {
    expect(roleHasPermission('TEACHER', 'teachers.read')).toBe(true);
    expect(roleHasPermission('TEACHER', 'grades.enter')).toBe(true);
    expect(roleHasPermission('TEACHER', 'attendance.manage')).toBe(true);
    expect(roleHasPermission('TEACHER', 'announcements.create')).toBe(true);
  });

  it('keeps a parent read-only across their children’s data', () => {
    expect(roleHasPermission('PARENT', 'grades.read')).toBe(true);
    expect(roleHasPermission('PARENT', 'announcements.read')).toBe(true);
    expect(roleHasPermission('PARENT', 'notifications.read')).toBe(true);
    expect(roleHasPermission('PARENT', 'grades.enter')).toBe(false);
    expect(roleHasPermission('PARENT', 'students.manage')).toBe(false);
  });

  it('does not grant teachers school/student management permissions', () => {
    expect(roleHasPermission('TEACHER', 'academic_structure.read')).toBe(true);
    expect(roleHasPermission('TEACHER', 'academic_structure.manage')).toBe(false);
    expect(roleHasPermission('TEACHER', 'students.manage')).toBe(false);
    expect(roleHasPermission('TEACHER', 'teachers.manage')).toBe(false);
    expect(roleHasPermission('TEACHER', 'grades.publish')).toBe(false);
  });

  it('does not expose raw academic-structure APIs to parents in V1', () => {
    expect(roleHasPermission('PARENT', 'academic_structure.read')).toBe(false);
    expect(roleHasPermission('PARENT', 'academic_structure.manage')).toBe(false);
  });

  it('denies every permission when the role is null/undefined', () => {
    expect(roleHasPermission(null, 'grades.read')).toBe(false);
    expect(roleHasPermission(undefined, 'grades.read')).toBe(false);
  });
});
