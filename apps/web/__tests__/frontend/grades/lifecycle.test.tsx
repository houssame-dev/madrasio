import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentLifecycleActions, assessmentTransitions } from '@/components/grades/assessment-lifecycle-actions';
import { GradebookLifecycleActions, gradebookTransitions } from '@/components/grades/gradebook-lifecycle-actions';
import { assessment, gradebook, renderGrades } from './test-helpers';

afterEach(() => vi.restoreAllMocks());
describe('Gradebook and Assessment lifecycle controls', () => {
  it('exposes only DRAFT → OPEN → CLOSED → ARCHIVED for Gradebooks', () => { expect(gradebookTransitions('DRAFT').map((row) => row.status)).toEqual(['OPEN']); expect(gradebookTransitions('OPEN').map((row) => row.status)).toEqual(['CLOSED']); expect(gradebookTransitions('CLOSED').map((row) => row.status)).toEqual(['ARCHIVED']); expect(gradebookTransitions('ARCHIVED')).toEqual([]); });
  it('confirms Gradebook close before sending exact status only', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...gradebook, status: 'CLOSED' } })); renderGrades(<GradebookLifecycleActions gradebook={{ ...gradebook, status: 'OPEN' }} onSaved={vi.fn()} />); await userEvent.click(screen.getByRole('button', { name: 'Close' })); expect(screen.getByRole('dialog')).toHaveTextContent(/stop further Grade and Assessment changes/); expect(fetchMock).not.toHaveBeenCalled(); await userEvent.click(screen.getByRole('button', { name: 'Confirm' })); await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/gradebooks/${gradebook.id}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'CLOSED' }) }))); });
  it('exposes only the committed Assessment lifecycle with ARCHIVED terminal', () => { expect(assessmentTransitions('DRAFT').map((row) => row.status)).toEqual(['PUBLISHED', 'ARCHIVED']); expect(assessmentTransitions('PUBLISHED').map((row) => row.status)).toEqual(['ARCHIVED']); expect(assessmentTransitions('ARCHIVED')).toEqual([]); });
  it('warns that publishing locks calculation-relevant settings', async () => { vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { ...assessment, status: 'PUBLISHED' } })); renderGrades(<AssessmentLifecycleActions assessment={assessment} onSaved={vi.fn()} />); await userEvent.click(screen.getByRole('button', { name: 'Publish' })); expect(screen.getByRole('dialog')).toHaveTextContent('Publishing locks calculation-relevant Assessment settings.'); });
});
