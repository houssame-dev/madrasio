import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GradeEntryDialog } from '@/components/grades/grade-entry/grade-entry-dialog';
import { GradebookGradesPanel } from '@/components/grades/grade-entry/gradebook-grades-panel';
import { assessment, assessmentId, gradebookId, matrix, renderGrades, schoolId, studentId, validGrade } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

function setup(error = false) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === `/api/v1/gradebooks/${gradebookId}/grades?page=1&pageSize=100`) return Response.json(matrix);
    if (url === `/api/v1/gradebooks/${gradebookId}/grades?page=1&pageSize=20`) return Response.json({ ...matrix, meta: { ...matrix.meta, pageSize: 20 } });
    if (url === `/api/v1/assessments/${assessmentId}/grades` && (init as RequestInit | undefined)?.method === 'PUT') {
      if (error) return Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'INVALID_GRADE_SCORE', message: 'unsafe' } }, { status: 409 });
      return Response.json({ data: { grades: [validGrade] } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Assessment Grade entry', () => {
  it('uses the authoritative roster and prepopulates an existing exact decimal Grade', async () => {
    const fetchMock = setup();
    renderGrades(<GradeEntryDialog open schoolId={schoolId} gradebookId={gradebookId} assessment={{ ...assessment, status: 'PUBLISHED' }} onClose={vi.fn()} />);
    expect(await screen.findByText('Sara Amrani')).toBeInTheDocument();
    expect(screen.getByLabelText('Grade state for Sara Amrani')).toHaveValue('VALID');
    expect(screen.getByLabelText('Score for Sara Amrani')).toHaveValue('12.25');
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/gradebooks/${gradebookId}/grades?page=1&pageSize=100`, expect.any(Object));
  });

  it('clears score for a non-scored state and sends one atomic bulk request only', async () => {
    const fetchMock = setup();
    const rendered = renderGrades(<GradeEntryDialog open schoolId={schoolId} gradebookId={gradebookId} assessment={{ ...assessment, status: 'PUBLISHED' }} onClose={vi.fn()} />);
    const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries');
    const state = await screen.findByLabelText('Grade state for Sara Amrani');
    await userEvent.selectOptions(state, 'ABSENT');
    expect(screen.getByLabelText('Score for Sara Amrani')).toBeDisabled();
    expect(screen.getByLabelText('Score for Sara Amrani')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Grades saved. Results were not recalculated automatically.');
    const writes = fetchMock.mock.calls.filter(([url, init]) => String(url).includes(`/assessments/${assessmentId}/grades`) && (init as RequestInit | undefined)?.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String((writes[0][1] as RequestInit).body))).toEqual({ grades: [{ studentId, state: 'ABSENT', score: null }] });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/results/'))).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grades', schoolId, 'gradebooks', gradebookId, 'matrix'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grades', schoolId, 'results'] });
  });

  it.each(['0', '10.5', '12.25'])('preserves valid decimal score %s in the exact payload', async (score) => {
    const fetchMock = setup();
    renderGrades(<GradeEntryDialog open schoolId={schoolId} gradebookId={gradebookId} assessment={{ ...assessment, status: 'PUBLISHED' }} onClose={vi.fn()} />);
    const input = await screen.findByLabelText('Score for Sara Amrani');
    await userEvent.clear(input); await userEvent.type(input, score);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes(`/assessments/${assessmentId}/grades`) && JSON.parse(String((init as RequestInit).body)).grades[0].score === score)).toBe(true));
  });

  it.each(['-1', '20.01', '10.555'])('rejects invalid score %s before mutation', async (score) => {
    const fetchMock = setup();
    renderGrades(<GradeEntryDialog open schoolId={schoolId} gradebookId={gradebookId} assessment={{ ...assessment, status: 'PUBLISHED' }} onClose={vi.fn()} />);
    const input = await screen.findByLabelText('Score for Sara Amrani'); await userEvent.clear(input); await userEvent.type(input, score);
    expect(input).toHaveValue(score);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(score === '20.01' ? 'Score must not exceed 20.00.' : 'Use a non-negative decimal with at most two decimal places.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes(`/assessments/${assessmentId}/grades`) && (init as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('retains dirty values after an atomic server failure', async () => {
    setup(true);
    renderGrades(<GradeEntryDialog open schoolId={schoolId} gradebookId={gradebookId} assessment={{ ...assessment, status: 'PUBLISHED' }} onClose={vi.fn()} />);
    const input = await screen.findByLabelText('Score for Sara Amrani'); await userEvent.clear(input); await userEvent.type(input, '10.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Each valid score must be between zero and the Assessment maximum.')).toBeInTheDocument();
    expect(input).toHaveValue('10.5'); expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
  });
});

describe('Persisted Gradebook matrix', () => {
  it('renders persisted Grades and explicit unentered cells without averages', async () => {
    setup(); renderGrades(<GradebookGradesPanel schoolId={schoolId} gradebookId={gradebookId} />);
    expect(await screen.findByText('12.25 / 20.00')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText(/average|coefficient|total/i)).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Sara Amrani')).toBeInTheDocument();
  });
});
