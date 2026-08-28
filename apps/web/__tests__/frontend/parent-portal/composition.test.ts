import { describe, expect, it } from 'vitest';
import { parentKeys } from '@/lib/frontend/parents/queries';
import { childPlacementQuery, childResultsQuery, parentBootstrapQuery, parentChildKeys } from '@/lib/frontend/parent-portal/queries';
import { childHref, relatedChildren } from '@/lib/frontend/parent-portal/types';
import { schoolId, student } from '../parents/test-helpers';

const otherSchoolId = '00000000-0000-4000-8000-000000000299';

describe('Parent portal composition', () => {
  it('uses the existing School-keyed self-profile cache boundary', () => {
    expect(parentBootstrapQuery(schoolId).queryKey).toEqual(parentKeys.selfProfiles(schoolId));
    expect(parentBootstrapQuery(schoolId).queryKey).not.toEqual(parentBootstrapQuery(otherSchoolId).queryKey);
  });

  it('deduplicates a child by Student identity without using relationship priority', () => {
    const parent = (id: string, relationshipId: string) => ({
      parent: { id, firstName: 'Parent', lastName: id, status: 'ACTIVE' as const },
      children: [{ relationshipId, student: { id: student.id, firstName: student.firstName, lastName: student.lastName, studentCode: student.studentCode } }],
    });
    expect(relatedChildren([parent('p1', 'r1'), parent('p2', 'r2')])).toEqual([{ id: student.id, firstName: 'Nora', lastName: 'Alaoui', studentCode: 'S-01' }]);
    expect(childHref(student.id)).toBe(`/children/${student.id}`);
  });

  it('keeps Parent placement and Result caches School, child, Year, and type scoped', () => {
    expect(childPlacementQuery(schoolId, student.id, 'year-1').queryKey).toEqual(parentChildKeys.placement(schoolId, student.id, 'year-1'));
    expect(childResultsQuery(schoolId, student.id, 'year-1', 'SUBJECT').queryKey)
      .not.toEqual(childResultsQuery(schoolId, student.id, 'year-1', 'ANNUAL').queryKey);
    expect(childResultsQuery(schoolId, student.id, 'year-1', 'SUBJECT').queryKey)
      .not.toEqual(childResultsQuery(otherSchoolId, student.id, 'year-1', 'SUBJECT').queryKey);
  });
});
