import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParentForm } from '@/components/parents/parent-form';
import { ParentLifecycleActions, parentTransitions } from '@/components/parents/lifecycle-actions';

import { parent, renderParents } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Parent profile form and lifecycle', () => {
  it('creates the exact profile payload without account, relationship, or role mutation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: parent }));
    renderParents(<ParentForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('First name'), 'Samira');
    await userEvent.type(screen.getByLabelText('Last name'), 'Alaoui');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload).toEqual({ firstName: 'Samira', lastName: 'Alaoui', parentCode: null });
    expect(payload).not.toHaveProperty('studentId');
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('userId');
    expect(screen.queryByLabelText(/User UUID/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a profile conflict without leaking server detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      error: { code: 'CONFLICT', featureCode: 'DUPLICATE_PARENT_CODE', message: 'database detail' },
    }, { status: 409 }));
    renderParents(<ParentForm initial={parent} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/code is already used/);
    expect(screen.getByRole('alert')).not.toHaveTextContent('database detail');
  });

  it('exposes the exact lifecycle graph', () => {
    expect(parentTransitions('ACTIVE').map((item) => item.status)).toEqual(['INACTIVE']);
    expect(parentTransitions('INACTIVE').map((item) => item.status)).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(parentTransitions('ARCHIVED')).toEqual([]);
  });

  it('confirms deactivation without claiming relationships end', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...parent, status: 'INACTIVE' } }));
    renderParents(<ParentLifecycleActions parent={parent} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/relationship rows are not ended or deleted/);
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/parents/${parent.id}`,
      expect.objectContaining({ body: JSON.stringify({ status: 'INACTIVE' }) }),
    ));
  });
});
