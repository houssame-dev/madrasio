import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/frontend/api-client';
import { academicErrorMessage } from '@/lib/frontend/academic/errors';
import { listAllResource } from '@/lib/frontend/academic/api';
import { academicKeys } from '@/lib/frontend/academic/queries';
import { classTransitions, curriculumTransitions, periodTransitions, versionTransitions, yearTransitions } from '@/components/academic/lifecycle-actions';

afterEach(() => vi.restoreAllMocks());

describe('academic API/query/lifecycle rules', () => {
  it('pages through every bounded selector result instead of assuming page one is complete', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const page = new URL(`http://test${url}`).searchParams.get('page');
      return Response.json({ data: page === '1' ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }], meta: { page: Number(page), pageSize: 100, total: 101 } });
    });
    const result = await listAllResource<{ id: number }>('/api/v1/subjects');
    expect(result).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('includes School context and filters in stable academic query keys', () => {
    expect(academicKeys.list('school-a', 'subjects', { page: 2, search: 'math' })).toEqual(['academic', 'school-a', 'subjects', 'list', { page: 2, search: 'math' }]);
  });

  it('maps controlled domain codes without leaking foreign tenant existence', () => {
    expect(academicErrorMessage(new ApiClientError(404, { code: 'NOT_FOUND', featureCode: 'NOT_FOUND', message: 'Foreign School row exists.' }))).toBe('This resource is no longer available.');
    expect(academicErrorMessage(new ApiClientError(409, { code: 'CONFLICT', featureCode: 'DUPLICATE_RESOURCE', message: 'constraint x' }))).toBe('A resource with the same identity already exists.');
    expect(academicErrorMessage(new ApiClientError(400, { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'ACADEMIC_YEAR_DATES_IMMUTABLE', message: 'raw' }))).toContain('can no longer be changed');
  });

  it('offers only committed lifecycle transitions', () => {
    expect(yearTransitions('PLANNED').map((item) => item.status)).toEqual(['ACTIVE']);
    expect(yearTransitions('ARCHIVED')).toEqual([]);
    expect(periodTransitions('CLOSED')).toEqual([]);
    expect(curriculumTransitions('INACTIVE').map((item) => item.status)).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(versionTransitions('ACTIVE').map((item) => item.status)).toEqual(['ARCHIVED']);
    expect(classTransitions('ARCHIVED')).toEqual([]);
  });
});
