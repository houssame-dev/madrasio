import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentForm } from '@/components/students/student-form';
import { StudentLifecycleActions, studentTransitions } from '@/components/students/lifecycle-actions';
import { renderStudents, student } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Student identity forms and lifecycle', () => {
  it('creates identity only with an optional code and no placement authority', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: student }));
    renderStudents(<StudentForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('First name'), 'Amina');
    await userEvent.type(screen.getByLabelText('Last name'), 'Bennani');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload).toEqual({ firstName: 'Amina', lastName: 'Bennani', studentCode: null });
    expect(payload).not.toHaveProperty('classId'); expect(payload).not.toHaveProperty('academicYearId'); expect(payload).not.toHaveProperty('userId');
  });

  it('edits only committed identity fields and maps duplicate code safely', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'CONFLICT', featureCode: 'DUPLICATE_STUDENT_CODE', message: 'raw database detail' } }, { status: 409 }));
    renderStudents(<StudentForm initial={student} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText('Student code (Optional)'));
    await userEvent.type(screen.getByLabelText('Student code (Optional)'), 'DUP');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already used in this School');
    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload).toEqual({ firstName: 'Amina', lastName: 'Bennani', studentCode: 'DUP' });
  });

  it('renders the exact lifecycle graph with ARCHIVED terminal', () => {
    expect(studentTransitions('ACTIVE').map((item) => item.status)).toEqual(['INACTIVE', 'WITHDRAWN']);
    expect(studentTransitions('INACTIVE').map((item) => item.status)).toEqual(['ACTIVE', 'WITHDRAWN', 'ARCHIVED']);
    expect(studentTransitions('WITHDRAWN').map((item) => item.status)).toEqual(['ARCHIVED']);
    expect(studentTransitions('ARCHIVED')).toEqual([]);
  });

  it('requires confirmation for withdrawal and preserves Enrollment history language', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...student, status: 'WITHDRAWN' } }));
    renderStudents(<StudentLifecycleActions student={student} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/history will not be deleted/i);
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/students/${student.id}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'WITHDRAWN' }) })));
  });
});
