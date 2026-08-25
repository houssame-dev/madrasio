import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassForm, CurriculumSubjectForm, SubjectForm, VersionForm } from '@/components/academic/forms';
import { classTransitions } from '@/components/academic/lifecycle-actions';
import { curriculumId, levelId, stageId, subjectId, timestamps, trackId, versionId, yearId } from './test-helpers';

function renderForm(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe('academic forms use exact contracts', () => {
  it('creates an optional-code Subject without ever sending coefficient', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: subjectId } }));
    renderForm(<SubjectForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Mathematics');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/subjects', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Mathematics', code: null }) }));
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).not.toContain('coefficient');
  });

  it('maps backend validation details to the matching form field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: { issues: [{ path: 'code', message: 'Code is too long.' }] } } }, { status: 400 }));
    renderForm(<SubjectForm onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Mathematics');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Code is too long.')).toBeInTheDocument();
  });

  it('creates a named CurriculumVersion without a versionNumber', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: versionId } }));
    renderForm(<VersionForm curriculumId={curriculumId} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), '2026 programme');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    expect(body).toBe(JSON.stringify({ name: '2026 programme' }));
    expect(body).not.toContain('versionNumber');
  });

  it('validates positive coefficient and removes already attached Subjects from selection', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: 'attached' } }));
    const subjects = [{ id: subjectId, name: 'Mathematics', code: 'MAT', status: 'ACTIVE' as const, ...timestamps }, { id: '00000000-0000-4000-8000-000000000071', name: 'Physics', code: null, status: 'ACTIVE' as const, ...timestamps }];
    renderForm(<CurriculumSubjectForm version={{ id: versionId, curriculumId, name: 'V1', status: 'DRAFT', ...timestamps }} subjects={subjects} attachedSubjectIds={new Set([subjectId])} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('option', { name: /Mathematics/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Coefficient'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates CurriculumSubject with coefficient and selected exact Subject', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: 'attached' } }));
    const subjects = [{ id: subjectId, name: 'Mathematics', code: null, status: 'ACTIVE' as const, ...timestamps }];
    renderForm(<CurriculumSubjectForm version={{ id: versionId, curriculumId, name: 'V1', status: 'DRAFT', ...timestamps }} subjects={subjects} attachedSubjectIds={new Set()} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Coefficient'), '7.50');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ subjectId, coefficient: '7.5', displayOrder: null });
  });

  it('creates a Class with exact relations and keeps Year read-only on edit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: 'class' } }));
    const years = [{ id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'PLANNED' as const, ...timestamps }];
    const levels = [{ id: levelId, stageId, name: 'Level 1', sequence: 1, status: 'ACTIVE' as const, ...timestamps }];
    const tracks = [{ id: trackId, name: 'Science', sequence: 1, status: 'ACTIVE' as const, ...timestamps }];
    const versions = [{ id: versionId, curriculumId, curriculumName: 'National', name: 'V1', status: 'DRAFT' as const, ...timestamps }];
    const view = renderForm(<ClassForm years={years} levels={levels} tracks={tracks} versions={versions} onCancel={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Class A');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/classes');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ name: 'Class A', academicYearId: yearId, levelId, trackId: null, curriculumVersionId: versionId });
    view.unmount(); fetchMock.mockClear();
    renderForm(<ClassForm years={years} levels={levels} tracks={tracks} versions={versions} initial={{ id: 'class', name: 'Class A', academicYearId: yearId, stageId, levelId, trackId: null, curriculumVersionId: versionId, status: 'ACTIVE', ...timestamps }} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText('2026/2027')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Academic year' })).not.toBeInTheDocument();
    expect(classTransitions('ARCHIVED')).toEqual([]);
  });
});
