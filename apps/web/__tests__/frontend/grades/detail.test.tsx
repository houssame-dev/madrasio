import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GradebookDetailWorkspace } from '@/components/grades/gradebook-detail';
import { gradebook, gradebookId, renderGrades, setupGradebookFetch, versionId } from './test-helpers';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => `/grades/${gradebookId}`, useRouter: () => ({ replace: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

describe('Gradebook detail context and access', () => {
  it('shows all exact context dimensions and the bound Version as read-only text', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock); renderGrades(<GradebookDetailWorkspace gradebookId={gradebookId} />); expect(await screen.findByRole('heading', { name: gradebook.name! })).toBeInTheDocument(); expect(screen.getByText('2026/2027')).toBeInTheDocument(); expect(screen.getAllByText(/Term 1/).length).toBeGreaterThanOrEqual(2); expect(screen.getByText('1A')).toBeInTheDocument(); expect(screen.getByText('Mathematics')).toBeInTheDocument(); expect(screen.getByText(versionId)).toBeInTheDocument(); expect(screen.queryByLabelText('Grading Configuration Version')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Academic Year')).not.toBeInTheDocument(); });
  it('gives Teacher the server-resolved Gradebook workspace and mutation controls', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch'); setupGradebookFetch(fetchMock); renderGrades(<GradebookDetailWorkspace gradebookId={gradebookId} />, 'TEACHER'); expect(await screen.findByRole('button', { name: 'Open' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Create Assessment' })).toBeInTheDocument(); });
  it('denies Parent before loading raw Gradebook detail', () => { const fetchMock = vi.spyOn(globalThis, 'fetch'); renderGrades(<GradebookDetailWorkspace gradebookId={gradebookId} />, 'PARENT'); expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled(); });
  it('uses a safe unavailable state for hidden or foreign Gradebooks', async () => { vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ error: { code: 'NOT_FOUND', featureCode: 'GRADEBOOK_NOT_FOUND', message: 'foreign school detail' } }, { status: 404 })); renderGrades(<GradebookDetailWorkspace gradebookId={gradebookId} />); expect(await screen.findByText('Gradebooks are unavailable')).toBeInTheDocument(); expect(screen.queryByText('foreign school detail')).not.toBeInTheDocument(); });
});
