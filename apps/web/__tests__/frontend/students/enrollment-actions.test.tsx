import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EndEnrollmentForm, EnrollmentForm, TransferForm } from '@/components/students/enrollment-forms';
import { renderStudents, classId, enrollment, klass, otherClassId, otherYearId, page, schoolId, studentId, year } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Enrollment management forms', () => {
  it('loads Classes for the exact Year and creates the exact Enrollment payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'POST' ? Response.json({ data: enrollment }) : Response.json(page([klass], 1, 100)));
    renderStudents(<EnrollmentForm schoolId={schoolId} studentId={studentId} years={[year]} initialYearId={year.id} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`academicYearId=${year.id}`);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=ACTIVE');
    await userEvent.selectOptions(screen.getByLabelText('Class'), classId);
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect(String(post?.[0])).toBe(`/api/v1/students/${studentId}/enrollments`);
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ academicYearId: year.id, classId, effectiveFrom: '2026-09-01' });
  });

  it('clears an incompatible Class and reloads options when the Year changes', async () => {
    const otherYear = { ...year, id: otherYearId, name: '2027/2028', status: 'PLANNED' as const };
    const otherClass = { ...klass, id: otherClassId, academicYearId: otherYearId, name: '2A' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json(page(String(input).includes(otherYearId) ? [otherClass] : [klass], 1, 100)));
    renderStudents(<EnrollmentForm schoolId={schoolId} studentId={studentId} years={[year, otherYear]} initialYearId={year.id} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' });
    await userEvent.selectOptions(screen.getByLabelText('Class'), classId);
    expect(screen.getByLabelText('Class')).toHaveValue(classId);
    await userEvent.selectOptions(screen.getByLabelText('Academic Year'), otherYearId);
    expect(screen.getByLabelText('Class')).toHaveValue('');
    expect(await screen.findByRole('option', { name: '2A' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`academicYearId=${otherYearId}`))).toBe(true);
  });

  it('uses the dedicated transfer endpoint, excludes the current Class, and sends no old-row mutation', async () => {
    const target = { ...klass, id: otherClassId, name: '1B' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { previousEnrollment: { ...enrollment, status: 'ENDED' }, currentEnrollment: { ...enrollment, id: 'new', classId: otherClassId } } }));
    renderStudents(<TransferForm studentId={studentId} year={year} classes={[klass, target]} current={enrollment} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('option', { name: '1A' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Target Class'), otherClassId);
    fireEvent.change(screen.getByLabelText('Transfer effective date'), { target: { value: '2026-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/students/${studentId}/transfer`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ academicYearId: year.id, toClassId: otherClassId, effectiveDate: '2026-10-01' }) }));
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).not.toContain('effectiveUntil');
  });

  it('ends through the dedicated idempotent action with the exact inclusive date', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...enrollment, status: 'ENDED', effectiveUntil: '2026-12-20' } }));
    renderStudents(<EndEnrollmentForm enrollment={enrollment} onCancel={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Effective until'), { target: { value: '2026-12-20' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm end Enrollment' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/student-enrollments/${enrollment.id}/end`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ effectiveUntil: '2026-12-20' }) })));
  });

  it('blocks obvious invalid transfer/end dates before calling the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const target = { ...klass, id: otherClassId, name: '1B' };
    const view = renderStudents(<TransferForm studentId={studentId} year={year} classes={[klass, target]} current={enrollment} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Target Class'), otherClassId);
    fireEvent.change(screen.getByLabelText('Transfer effective date'), { target: { value: enrollment.effectiveFrom } });
    fireEvent.submit(screen.getByLabelText('Transfer effective date').closest('form')!);
    expect(await screen.findByText(/must be after the current Enrollment/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
    renderStudents(<EndEnrollmentForm enrollment={enrollment} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText('Effective until')).toHaveAttribute('min', enrollment.effectiveFrom);
    fireEvent.change(screen.getByLabelText('Effective until'), { target: { value: '2026-08-31' } });
    fireEvent.submit(screen.getByLabelText('Effective until').closest('form')!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps duplicate active Enrollment and transfer conflicts to safe messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'POST' ? Response.json({ error: { code: 'CONFLICT', featureCode: 'DUPLICATE_ENROLLMENT', message: 'constraint raw' } }, { status: 409 }) : Response.json(page([klass], 1, 100)));
    renderStudents(<EnrollmentForm schoolId={schoolId} studentId={studentId} years={[year]} initialYearId={year.id} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' });
    await userEvent.selectOptions(screen.getByLabelText('Class'), classId);
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has an active enrollment/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/constraint raw/i);
  });
});
