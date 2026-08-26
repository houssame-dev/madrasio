import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentsPanel } from '@/components/grades/assessments-panel';
import { assessment, gradebook, page, period, renderGrades } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => `/grades/${gradebook.id}`, useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });
describe('Assessment list and editability', () => {
  it('renders setup fields and no Grade-entry or Homework calls', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([assessment]))); renderGrades(<AssessmentsPanel schoolId="school" gradebook={gradebook} period={period} canManage />); expect(await screen.findByText('Quiz 1')).toBeInTheDocument(); expect(screen.getByText('20.00')).toBeInTheDocument(); expect(screen.getByText('1.50')).toBeInTheDocument(); expect(screen.getByText('Grade entry is deferred to Task 031.')).toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => /homeworks|\/grades(?:\?|$)/.test(String(url)))).toBe(false); });
  it('keeps published structural settings read-only', async () => { vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([{ ...assessment, status: 'PUBLISHED' }]))); renderGrades(<AssessmentsPanel schoolId="school" gradebook={gradebook} period={period} canManage />); await screen.findByText('Quiz 1'); expect(screen.queryByRole('button', { name: /Edit Assessment/ })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument(); });
  it('prevents create UX when the separately loaded Period is CLOSED', async () => { vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([]))); renderGrades(<AssessmentsPanel schoolId="school" gradebook={gradebook} period={{ ...period, status: 'CLOSED' }} canManage />); expect(await screen.findByText(/Academic Period is CLOSED/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Create Assessment' })).not.toBeInTheDocument(); });
  it('removes all mutation controls for read-only users', async () => { vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([assessment]))); renderGrades(<AssessmentsPanel schoolId="school" gradebook={gradebook} period={period} canManage={false} />, 'TEACHER'); await screen.findByText('Quiz 1'); expect(screen.queryByRole('button', { name: 'Create Assessment' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument(); });
});
