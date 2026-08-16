import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Can } from '@/lib/authorization/can';
import { roleHasPermission } from '@/lib/authorization/permissions';

describe('Can — UX permission gate (Task 005 §19, CLAUDE.md §40)', () => {
  it('renders children when the role has the permission', () => {
    render(
      <Can role="SCHOOL_ADMIN" permission="students.manage">
        <button type="button">Create student</button>
      </Can>,
    );
    expect(screen.getByRole('button', { name: 'Create student' })).toBeInTheDocument();
  });

  it('renders nothing when the role lacks the permission', () => {
    render(
      <Can role="PARENT" permission="students.manage">
        <button type="button">Create student</button>
      </Can>,
    );
    expect(screen.queryByRole('button', { name: 'Create student' })).not.toBeInTheDocument();
  });

  it('renders nothing for a null role', () => {
    render(
      <Can role={null} permission="grades.read">
        <span>Grades</span>
      </Can>,
    );
    expect(screen.queryByText('Grades')).not.toBeInTheDocument();
  });

  it('is consistent with the shared roleHasPermission helper', () => {
    expect(roleHasPermission('TEACHER', 'grades.enter')).toBe(true);
    expect(roleHasPermission('TEACHER', 'grades.publish')).toBe(false);
  });
});