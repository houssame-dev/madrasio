// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyResultsPage from '@/app/(app)/grades/results/page';

const redirect = vi.hoisted(() => vi.fn((destination: string): never => { throw new Error(`NEXT_REDIRECT: ${destination}`); }));
vi.mock('next/navigation', () => ({ redirect }));
beforeEach(() => { redirect.mockClear(); });

describe('legacy Results route', () => {
  it('redirects the unfiltered route to the independent Results workspace', async () => {
    await expect(LegacyResultsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith('/results');
  });

  it('preserves academic filters, result type, status and pagination', async () => {
    const filters = { academicYearId: 'year-id', academicPeriodId: 'period-id', classId: 'class-id', subjectId: 'subject-id', studentId: 'student-id', resultType: 'SUBJECT', status: 'FINALIZED', page: '2' };
    await expect(LegacyResultsPage({ searchParams: Promise.resolve(filters) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith(`/results?${new URLSearchParams(filters)}`);
  });

  it('encodes repeated and special-character values without changing the redirect destination', async () => {
    await expect(LegacyResultsPage({ searchParams: Promise.resolve({ classId: ['one', 'two'], search: 'النتائج & notes', next: 'https://example.test', absent: undefined }) })).rejects.toThrow('NEXT_REDIRECT');
    const destination = new URL(redirect.mock.calls[0]![0]!, 'https://madrasio.test');
    expect(destination.origin).toBe('https://madrasio.test');
    expect(destination.pathname).toBe('/results');
    expect(destination.searchParams.getAll('classId')).toEqual(['one', 'two']);
    expect(destination.searchParams.get('search')).toBe('النتائج & notes');
    expect(destination.searchParams.has('absent')).toBe(false);
  });
});
