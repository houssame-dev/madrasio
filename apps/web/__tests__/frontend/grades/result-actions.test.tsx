import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultActions } from '@/components/grades/results/result-actions';
import { renderGrades, resultId, schoolId, subjectResult } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Result lifecycle and publication actions', () => {
  it('requires confirmation and finalizes without changing the client Result value', async () => {
    const changed = vi.fn(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: resultId, resultType: 'SUBJECT', value: '12.25', status: 'FINALIZED' } }));
    renderGrades(<ResultActions schoolId={schoolId} result={subjectResult} onChanged={changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Finalize' }));
    expect(screen.getByText('Finalization locks this Result for publication and historical use.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/results/${resultId}/finalize`, expect.objectContaining({ method: 'POST' })));
    expect(changed).toHaveBeenCalledWith('Result finalized.');
  });

  it('publishes with no editable recipients and reports asynchronous notifications', async () => {
    const changed = vi.fn(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { publicationId: 'publication', publicationVersion: 1 } }, { status: 201 }));
    renderGrades(<ResultActions schoolId={schoolId} result={{ ...subjectResult, status: 'FINALIZED' }} onChanged={changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publish Result' }));
    expect(screen.queryByRole('textbox', { name: /recipient/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith('Result published. Notifications are processed asynchronously.'));
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/publish'));
    const payload = JSON.parse(String((call?.[1] as RequestInit).body));
    expect(payload).toEqual({ resultType: 'SUBJECT', idempotencyKey: expect.any(String) });
    expect(fetchMock.mock.calls.some(([url]) => /notifications/.test(String(url)))).toBe(false);
  });

  it('uses only the atomic revise endpoint and keeps one key for retries of the same open attempt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'CONFLICT', featureCode: 'PUBLICATION_CONFLICT', message: 'conflict' } }, { status: 409 }));
    renderGrades(<ResultActions schoolId={schoolId} result={{ ...subjectResult, status: 'FINALIZED' }} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publish revision' }));
    expect(screen.getByText(/Previous publications remain unchanged/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByText('This publication attempt conflicts with an existing operation. Start a new intentional attempt.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/revise'))).toHaveLength(2));
    const bodies = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/revise')).map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
    expect(fetchMock.mock.calls.some(([url]) => /\/calculate|\/finalize|\/publish$/.test(String(url)))).toBe(false);
  });
});
