import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { parentWeekOverview } from '@/lib/modules/parents/application/dashboard-read-service';
import { createActor, createParentsTestContext } from './test-helpers';
import { seedStudent, seedParentRelationship } from '../students/test-helpers';
import { seedSchool } from '../auth/test-helpers';
let c:Awaited<ReturnType<typeof createParentsTestContext>>, actor:Awaited<ReturnType<typeof createActor>>, child:string, foreign:string;
const now=new Date('2025-10-10T12:00:00Z');
beforeAll(async()=>{
  c=await createParentsTestContext();actor=await createActor(c,'PARENT');
  child=(await seedStudent(c.test,c.schoolId,'dashboard')).id;foreign=(await seedStudent(c.test,c.schoolId,'foreign')).id;
  await seedParentRelationship(c,actor,child);
  await c.test.seed.insert(s.studentEnrollments).values({schoolId:c.schoolId,studentId:child,classId:c.classAId,academicYearId:c.yearId,effectiveFrom:'2025-09-01',effectiveUntil:'2025-10-12',status:'ENDED'});
  const [teacher]=await c.test.seed.insert(s.teachers).values({schoolId:c.schoolId,firstName:'Teacher',lastName:'Fixture'}).returning();
  const [period]=await c.test.seed.insert(s.academicPeriods).values({schoolId:c.schoolId,academicYearId:c.yearId,name:'Term',sequence:1,startDate:'2025-09-01',endDate:'2025-12-31'}).returning();
  for(const [dueDate,status,classId] of [['2025-10-10','PUBLISHED',c.classAId],['2025-10-11','PUBLISHED',c.classAId],['2025-10-12','PUBLISHED',c.classAId],['2025-10-13','PUBLISHED',c.classAId],['2025-10-09','PUBLISHED',c.classAId],['2025-10-10','DRAFT',c.classAId],['2025-10-10','ARCHIVED',c.classAId],['2025-10-10','CLOSED',c.classAId],['2025-10-10','PUBLISHED',c.classBId]] as const){
    const [h]=await c.test.seed.insert(s.homework).values({schoolId:c.schoolId,teacherId:teacher.id,subjectId:c.subjectId,academicYearId:c.yearId,academicPeriodId:period.id,title:`Practice ${dueDate}`,description:'Read the instructions.',dueDate,status}).returning();
    await c.test.seed.insert(s.homeworkTargets).values({schoolId:c.schoolId,homeworkId:h.id,academicYearId:c.yearId,classId});
  }
  for(const [date,status,classId,studentId] of [['2025-10-10','ABSENT',c.classAId,child],['2025-10-09','LATE',c.classAId,child],['2025-10-03','ABSENT',c.classAId,child],['2025-10-11','ABSENT',c.classAId,child],['2025-10-10','ABSENT',c.classBId,child],['2025-10-10','ABSENT',c.classAId,foreign]] as const){await c.test.seed.insert(s.attendanceRecords).values({schoolId:c.schoolId,studentId,classId,academicYearId:c.yearId,attendanceDate:date,status});}
});
afterAll(async()=>{await c?.test.client.close();});
it('returns exact upcoming counts/nearest instructions and actual ABSENT records with historical enrollment boundaries',async()=>{
  const result=await parentWeekOverview(c.parentDb,actor,child,c.yearId,now);
  expect(result).toMatchObject({date:'2025-10-10',from:'2025-10-04',through:'2025-10-17',upcomingCount:3,absenceRecords:1});
  expect(result.homework.map(h=>h.dueDate)).toEqual(['2025-10-10','2025-10-11','2025-10-12']);
  expect(result.homework[0].description).toBe('Read the instructions.');expect(result.homework[0]).not.toHaveProperty('submissionStatus');
});
it('denies unrelated children, another parent, teacher roles, unknown years and cross-school scope',async()=>{
  await expect(parentWeekOverview(c.parentDb,actor,foreign,c.yearId,now)).rejects.toThrow();
  await expect(parentWeekOverview(c.parentDb,await createActor(c,'PARENT'),child,c.yearId,now)).rejects.toThrow();
  await expect(parentWeekOverview(c.parentDb,await createActor(c,'TEACHER'),child,c.yearId,now)).rejects.toThrow();
  await expect(parentWeekOverview(c.parentDb,actor,child,crypto.randomUUID(),now)).rejects.toThrow();
  const school=await seedSchool(c.test.seed);await expect(parentWeekOverview(c.parentDb,{...actor,schoolId:school.id},child,c.yearId,now)).rejects.toThrow();
});
it('uses the school date even when the UTC day differs',async()=>{
  await c.test.seed.update(s.schools).set({timezone:'Pacific/Kiritimati'}).where(eq(s.schools.id,c.schoolId));
  expect((await parentWeekOverview(c.parentDb,actor,child,c.yearId,new Date('2025-10-09T15:00:00Z'))).date).toBe('2025-10-10');
});
