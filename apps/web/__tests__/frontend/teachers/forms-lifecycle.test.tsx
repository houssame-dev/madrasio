import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherForm } from '@/components/teachers/teacher-form';
import { TeacherLifecycleActions, teacherTransitions } from '@/components/teachers/lifecycle-actions';
import { renderTeachers, teacher, userId } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Teacher profile forms and lifecycle', () => {
  it('creates only the exact profile payload and never calls role or membership APIs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: teacher })); renderTeachers(<TeacherForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('First name'), 'Leila'); await userEvent.type(screen.getByLabelText('Last name'), 'Amrani'); await userEvent.type(screen.getByLabelText('Application User UUID (Optional)'), userId);
    await userEvent.click(screen.getByRole('button', { name: 'Create' })); await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ firstName: 'Leila', lastName: 'Amrani', teacherCode: null, userId });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/teachers'); expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('edits supported profile fields and maps invalid User links safely', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'INVALID_USER_LINK', message: 'foreign user detail' } }, { status: 422 }));
    renderTeachers(<TeacherForm initial={teacher} onCancel={vi.fn()} onSaved={vi.fn()} />); await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ACTIVE User with an ACTIVE membership/); expect(screen.getByRole('alert')).not.toHaveTextContent('foreign user detail');
    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)); expect(payload).not.toHaveProperty('classId'); expect(payload).not.toHaveProperty('role'); expect(payload).not.toHaveProperty('schoolId');
  });

  it('exposes the exact lifecycle graph with ARCHIVED terminal', () => {
    expect(teacherTransitions('ACTIVE').map((item) => item.status)).toEqual(['INACTIVE']);
    expect(teacherTransitions('INACTIVE').map((item) => item.status)).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(teacherTransitions('ARCHIVED')).toEqual([]);
  });

  it('confirms deactivation and explicitly preserves Assignment history', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...teacher, status: 'INACTIVE' } })); renderTeachers(<TeacherLifecycleActions teacher={teacher} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' })); expect(screen.getByRole('dialog')).toHaveTextContent(/Assignment history is not ended or deleted/); expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/teachers/${teacher.id}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) })));
  });
});
