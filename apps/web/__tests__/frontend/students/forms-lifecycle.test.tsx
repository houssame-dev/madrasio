import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentForm } from '@/components/students/student-form';
import { StudentLifecycleActions, studentTransitions } from '@/components/students/lifecycle-actions';
import { renderStudents, student } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Student identity forms and lifecycle', () => {
  it('requires new DOB with associated error/focus and makes no request on omission', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderStudents(<StudentForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('First name'), 'A');
    await userEvent.type(screen.getByLabelText('Last name'), 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dob = screen.getByLabelText('Date of birth');
    await waitFor(() => expect(dob).toHaveAttribute('aria-invalid', 'true'));
    expect(dob).toHaveFocus();
    expect(dob).toHaveAttribute('aria-describedby', expect.stringContaining('student-date-of-birth-error'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves blank legacy DOB on unrelated edits and submits a correction as an unchanged calendar string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: student }));
    renderStudents(<StudentForm initial={{ ...student, dateOfBirth: null }} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText('Date of birth')).not.toBeRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).not.toHaveProperty('dateOfBirth');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2000-02-29' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toMatchObject({ dateOfBirth: '2000-02-29' });
  });

  it('does not clear a recorded DOB and maps server School-today feedback to the field', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: {
      code: 'VALIDATION_ERROR', message: 'Invalid date', details: { issues: [{ path: 'dateOfBirth', message: 'Date of birth cannot be after today in the School timezone.' }] },
    } }, { status: 400 }));
    renderStudents(<StudentForm initial={{ ...student, dateOfBirth: '2012-02-29' }} onCancel={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose a valid date of birth (YYYY-MM-DD).')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2099-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Date of birth cannot be after today in the School timezone.')).toBeInTheDocument();
    expect(screen.getByLabelText('Date of birth')).toHaveFocus();
  });

  it('creates identity only with an optional code and no placement authority', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: student }));
    renderStudents(<StudentForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('First name'), 'Amina');
    await userEvent.type(screen.getByLabelText('Last name'), 'Bennani');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2012-02-29' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload).toEqual({ firstName: 'Amina', lastName: 'Bennani', studentCode: null, dateOfBirth: '2012-02-29' });
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
