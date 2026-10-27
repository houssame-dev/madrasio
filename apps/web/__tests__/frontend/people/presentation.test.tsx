import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { RelationshipForm } from '@/components/parents/relationship-form';
import { EnrollmentForm } from '@/components/students/enrollment-forms';
import { AssignmentForm } from '@/components/teachers/assignment-form';
import * as parents from '../parents/test-helpers';
import * as students from '../students/test-helpers';
import * as teachers from '../teachers/test-helpers';
afterEach(() => vi.restoreAllMocks());
it('clears a previously reviewed Student when search changes and never submits that hidden identity', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      Response.json(
        parents.page(
          String(input).includes('search=Other')
            ? [{ ...parents.student, id: parents.otherStudentId, firstName: 'Other' }]
            : [parents.student],
          1,
          10,
        ),
      ),
    );
  parents.renderParents(
    <RelationshipForm
      personLabel="Parent Fixture (P1)"
      schoolId={parents.schoolId}
      parentId={parents.parentId}
      activeRelationships={[]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await screen.findByRole('option', { name: /Nora/ });
  await userEvent.selectOptions(screen.getByLabelText('Student'), parents.studentId);
  expect(screen.getByRole('region', { name: 'Student' })).toHaveTextContent('Nora');
  await userEvent.type(screen.getByLabelText('Search Students by name or code'), 'Other');
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByRole('option', { name: /Other/ });
  expect(screen.getByLabelText('Student')).toHaveValue('');
  expect(screen.queryByRole('region', { name: 'Student' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Link Student' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Student')).toHaveAttribute('aria-invalid', 'true'),
  );
  expect(
    fetcher.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST'),
  ).toBe(false);
});
it('clears the Student selection when the bounded discovery page changes', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      Response.json(
        parents.page([parents.student], String(input).includes('page=2') ? 2 : 1, 10, 26),
      ),
    );
  parents.renderParents(
    <RelationshipForm
      schoolId={parents.schoolId}
      parentId={parents.parentId}
      activeRelationships={[]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await screen.findByRole('option', { name: /Nora/ });
  await userEvent.selectOptions(screen.getByLabelText('Student'), parents.studentId);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true),
  );
  expect(screen.getByLabelText('Student')).toHaveValue('');
});
it('does not guess an Enrollment Year when several eligible Years exist without context', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  students.renderStudents(
    <EnrollmentForm
      schoolId={students.schoolId}
      studentId={students.student.id}
      years={[students.year, { ...students.year, id: students.otherYearId, name: 'Other year' }]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Academic Year')).toHaveValue('');
  expect(screen.getByLabelText('Class')).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not guess an Assignment Year and repeats the selected Teacher context', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  teachers.renderTeachers(
    <AssignmentForm
      personLabel="Teacher Fixture (T1)"
      schoolId={teachers.schoolId}
      teacherId={teachers.teacherId}
      years={[teachers.year, { ...teachers.year, id: teachers.otherYearId, name: 'Other year' }]}
      subjects={[teachers.subject]}
      activeAssignments={[]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.getByText('Teacher Fixture (T1)')).toBeInTheDocument();
  expect(screen.getByLabelText('Academic Year')).toHaveValue('');
  expect(screen.getByLabelText('Class')).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
});
