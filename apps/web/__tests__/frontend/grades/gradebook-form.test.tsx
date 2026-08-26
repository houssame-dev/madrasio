import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GradebooksWorkspace } from '@/components/grades/gradebooks-workspace';
import {
  classId, gradebookId, periodId, renderGrades, setupGradebookFetch,
  subjectId, versionId, yearId,
} from './test-helpers';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/grades', useRouter: () => navigation }));
afterEach(() => { vi.restoreAllMocks(); navigation.replace.mockReset(); navigation.push.mockReset(); });

async function openForm() {
  await screen.findByText('Mathematics Term 1');
  await userEvent.click(screen.getByRole('button', { name: 'Create Gradebook' }));
  return screen.getByRole('dialog');
}

async function completeForm(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText('Gradebook name (optional)'), 'Exact setup');
  await userEvent.selectOptions(within(dialog).getByLabelText('Academic Year'), yearId);
  await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Term 1' })).toBeInTheDocument());
  await userEvent.selectOptions(within(dialog).getByLabelText('Academic Period'), periodId);
  await userEvent.selectOptions(within(dialog).getByLabelText('Class'), classId);
  await userEvent.selectOptions(within(dialog).getByLabelText('Subject'), subjectId);
  await userEvent.selectOptions(within(dialog).getByLabelText('Grading Configuration Version'), versionId);
}

describe('Gradebook creation completion', () => {
  it('renders a human-readable exact version selector without latest semantics or raw UUID input', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock);
    renderGrades(<GradebooksWorkspace />);
    const dialog = await openForm();
    expect(within(dialog).getByRole('option', { name: 'Standard Grading — Version 2' })).toHaveValue(versionId);
    expect(within(dialog).getByLabelText('Grading Configuration Version')).toHaveValue('');
    expect(within(dialog).queryByText(/latest|current/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /configuration/i })).not.toBeInTheDocument();
  });

  it('submits the exact Year, Period, Class, Subject, and Version then invalidates and opens the Gradebook', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock);
    const rendered = renderGrades(<GradebooksWorkspace />);
    const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries');
    const dialog = await openForm(); await completeForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/grades/${gradebookId}`));
    const call = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/v1/gradebooks' && (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ name: 'Exact setup', academicYearId: yearId, academicPeriodId: periodId, classId, subjectId, gradingConfigurationVersionId: versionId });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grades', expect.any(String), 'gradebooks'] });
  });

  it('blocks safely when no eligible version exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock, undefined, { versions: [] });
    renderGrades(<GradebooksWorkspace />);
    const dialog = await openForm();
    expect(within(dialog).getByText('No active grading configuration version is available.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/v1/gradebooks' && (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('renders discovery failures safely with retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock, undefined, { discoveryError: true });
    renderGrades(<GradebooksWorkspace />);
    const dialog = await openForm();
    expect(within(dialog).getByText('Eligible grading configuration versions could not be loaded.')).toBeInTheDocument();
    expect(within(dialog).queryByText('unsafe detail')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('grading-configuration-versions')).length).toBeGreaterThan(1));
  });

  it.each([
    ['DUPLICATE_GRADEBOOK', 'A Gradebook already exists for this exact Year, Period, Class, and Subject.'],
    ['INVALID_GRADEBOOK_CONTEXT', 'The selected Gradebook academic context is no longer eligible.'],
  ])('handles %s without navigating', async (featureCode, message) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock, undefined, { createError: { featureCode, message: 'unsafe backend detail' } });
    renderGrades(<GradebooksWorkspace />);
    const dialog = await openForm(); await completeForm(dialog);
    const discoveryCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('grading-configuration-versions')).length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    if (featureCode === 'INVALID_GRADEBOOK_CONTEXT') await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('grading-configuration-versions')).length).toBeGreaterThan(discoveryCalls));
  });

  it('offers creation to Teacher under the same server-enforced policy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock);
    renderGrades(<GradebooksWorkspace />, 'TEACHER');
    expect(await screen.findByRole('button', { name: 'Create Gradebook' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('grading-configuration-versions'))).toBe(true);
  });
});
