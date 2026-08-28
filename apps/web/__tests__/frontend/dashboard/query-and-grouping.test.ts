import { describe, expect, it } from 'vitest';
import { dashboardKeys } from '@/lib/frontend/dashboard/queries';
import { assignmentViews, groupTeacherClasses } from '@/lib/frontend/dashboard/types';
import { assignment, klass, otherSchoolId, schoolId, secondAssignment, secondSubject, subject, year } from './test-helpers';

describe('Teacher dashboard composition', () => {
  it('partitions assignment context by current School and normalizes profile-id ordering', () => {
    expect(dashboardKeys.assignments(schoolId, ['b', 'a'])).toEqual(['dashboard', schoolId, 'teacher-assignments', ['a', 'b']]);
    expect(dashboardKeys.assignments(schoolId, ['a'])).not.toEqual(dashboardKeys.assignments(otherSchoolId, ['a']));
  });

  it('groups multiple Subject assignments by exact Year and Class without merging Subject scope', () => {
    const views = assignmentViews([assignment, secondAssignment], [year], [klass], [subject, secondSubject], {
      academicYear: 'Unavailable Academic Year',
      className: 'Unavailable Class',
      subject: 'Unavailable Subject',
    });
    const groups = groupTeacherClasses(views);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ academicYearId: year.id, classId: klass.id, className: '1A' });
    expect(groups[0].assignments.map((item) => item.subjectName)).toEqual(['Mathematics', 'Physics']);
  });
});
