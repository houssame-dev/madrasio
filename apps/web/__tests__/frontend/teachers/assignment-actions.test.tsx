import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentForm, EndAssignmentForm } from '@/components/teachers/assignment-form';
import { AssignmentsPanel } from '@/components/teachers/assignments-panel';
import { assignment, classId, klass, otherClassId, otherYearId, page, renderTeachers, schoolId, subject, subjectId, teacherId, year } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Teacher Assignment workflows', () => {
  it('loads exact-Year ACTIVE Classes and submits the exact Assignment payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => init?.method === 'POST' ? Response.json({ data: assignment }) : Response.json(page([klass], 1, 100)));
    renderTeachers(<AssignmentForm schoolId={schoolId} teacherId={teacherId} years={[year]} subjects={[subject]} activeAssignments={[]} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' }); await userEvent.selectOptions(screen.getByLabelText('Class'), classId); await userEvent.selectOptions(screen.getByLabelText('Subject'), subjectId); fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-01' } }); await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect(String(post?.[0])).toBe(`/api/v1/teachers/${teacherId}/assignments`); expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ academicYearId: year.id, classId, subjectId, effectiveFrom: '2026-09-01' });
  });

  it('clears incompatible Class when Year changes', async () => {
    const otherYear = { ...year, id: otherYearId, name: '2027/2028', status: 'PLANNED' as const }; const otherClass = { ...klass, id: otherClassId, academicYearId: otherYearId, name: '2A' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json(page(String(input).includes(otherYearId) ? [otherClass] : [klass], 1, 100)));
    renderTeachers(<AssignmentForm schoolId={schoolId} teacherId={teacherId} years={[year, otherYear]} subjects={[subject]} activeAssignments={[]} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' }); await userEvent.selectOptions(screen.getByLabelText('Class'), classId); await userEvent.selectOptions(screen.getByLabelText('Academic Year'), otherYearId);
    expect(screen.getByLabelText('Class')).toHaveValue(''); expect(await screen.findByRole('option', { name: '2A' })).toBeInTheDocument();
  });

  it('blocks an obvious duplicate ACTIVE Assignment before POST', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([klass], 1, 100)));
    renderTeachers(<AssignmentForm schoolId={schoolId} teacherId={teacherId} years={[year]} subjects={[subject]} activeAssignments={[assignment]} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('option', { name: '1A' }); await userEvent.selectOptions(screen.getByLabelText('Class'), classId); await userEvent.selectOptions(screen.getByLabelText('Subject'), subjectId); fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-01' } }); await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already ACTIVE/); expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('ends only through the dedicated endpoint with an inclusive date', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...assignment, status: 'ENDED', effectiveUntil: '2026-12-20' } })); renderTeachers(<EndAssignmentForm assignment={assignment} onCancel={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Effective until'), { target: { value: '2026-12-20' } }); await userEvent.click(screen.getByRole('button', { name: 'Confirm end Assignment' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/teacher-assignments/${assignment.id}/end`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ effectiveUntil: '2026-12-20' }) })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders full context for ACTIVE and ENDED history and offers End only for ACTIVE', async () => {
    const ended = { ...assignment, id: '00000000-0000-4000-8000-000000000113', status: 'ENDED' as const, effectiveUntil: '2026-10-01' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([assignment, ended]))); renderTeachers(<AssignmentsPanel schoolId={schoolId} teacherId={teacherId} years={[year]} classes={[klass]} subjects={[subject]} page={1} canManage onPage={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findAllByText('2026/2027')).toHaveLength(2); expect(screen.getAllByText('1A')).toHaveLength(2); expect(screen.getAllByText('Mathematics')).toHaveLength(2); expect(screen.getAllByRole('button', { name: 'End Assignment' })).toHaveLength(1); expect(screen.getByText('ENDED')).toBeInTheDocument();
  });
});
