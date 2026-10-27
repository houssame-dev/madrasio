import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import * as schema from '@school/database';
const mock = vi.hoisted(() => ({ authorize: vi.fn(), sessions: vi.fn() }));
vi.mock('@/lib/authorization/server', () => ({ requireOperation: mock.authorize }));
vi.mock('@/lib/modules/attendance/application/session-service', () => ({ listSessions: mock.sessions }));
import { teacherReviewCount, teacherWorkspace, teacherLessonStatus } from '@/lib/modules/dashboard/teacher-workspace';
import { nextTeacherLesson, teacherAttendanceAction, teacherSessionHint, type TeacherLesson } from '@/lib/frontend/dashboard/teacher-workspace-types';
const pg = new PGlite(), db = drizzle(pg, { schema });
async function seed(sql: string, values: string[]) {
  await pg.exec(sql.replace(/\$(\d+)/g, (_, index) => "'" + values[Number(index)-1].replaceAll("'", "''") + "'"));
}
const ids = Array.from({ length: 16 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i+1).padStart(12,'0')}`);
const [school,otherSchool,user,otherUser,teacher,otherTeacher,year,klass,otherClass,subject,assignment,student,publication] = ids;
const actor = { schoolId: school, userId: user }, now = new Date('2026-10-26T10:00:00Z'), database = db as unknown as Parameters<typeof teacherWorkspace>[0];
const lesson: TeacherLesson = { publicationId: publication, lessonKey: 'one', academicYearId: year, classId: klass, className: '6A', subjectName: 'Math', start: '09:30', end: '10:30', roomId: null, roomName: null, status: 'ongoing', writable: true, expected: 2, recorded: 0 };
beforeAll(async () => {
  await pg.exec(`CREATE TABLE schools(id uuid,timezone text,status text); CREATE TABLE teachers(id uuid,school_id uuid,user_id uuid,status text); CREATE TABLE teacher_assignments(id uuid,school_id uuid,teacher_id uuid,academic_year_id uuid,class_id uuid,subject_id uuid,status text); CREATE TABLE students(id uuid,school_id uuid); CREATE TABLE student_enrollments(id uuid,school_id uuid,student_id uuid,academic_year_id uuid,class_id uuid,effective_from date,effective_until date,status text); CREATE TABLE attendance_records(school_id uuid,student_id uuid,class_id uuid,academic_year_id uuid,attendance_date date,publication_id uuid,lesson_key text); CREATE TABLE homework(id uuid,school_id uuid,academic_year_id uuid,subject_id uuid,due_date date,status text); CREATE TABLE homework_targets(id uuid,school_id uuid,homework_id uuid,academic_year_id uuid,class_id uuid); CREATE TABLE homework_submissions(id uuid,school_id uuid,homework_id uuid,student_id uuid,status text); CREATE TABLE homework_submission_attachments(id uuid,school_id uuid,submission_id uuid,file_id uuid); CREATE TABLE files(id uuid,state text);`);
  await seed(`INSERT INTO schools VALUES($1,'Africa/Casablanca','ACTIVE'),($2,'UTC','ACTIVE'); INSERT INTO teachers VALUES($3,$1,$4,'ACTIVE'),($5,$1,$6,'ACTIVE');`,[school,otherSchool,teacher,user,otherTeacher,otherUser]);
  await seed(`INSERT INTO teacher_assignments VALUES($1,$2,$3,$4,$5,$6,'ACTIVE'),($7,$2,$8,$4,$9,$6,'ACTIVE');`,[assignment,school,teacher,year,klass,subject,ids[13],otherTeacher,otherClass]);
  await seed(`INSERT INTO students VALUES($1,$2),($3,$2); INSERT INTO student_enrollments VALUES($1,$2,$1,$4,$5,'2026-09-01',null,'ACTIVE'),($3,$2,$3,$4,$5,'2026-09-01',null,'ACTIVE');`,[student,school,ids[14],year,klass]);
  mock.sessions.mockResolvedValue({ sessions: [lesson, { ...lesson, lessonKey: 'future', start: '14:00', end: '15:00', writable: false }] });
});
afterAll(() => pg.close());
it('uses school-local time and canonical authorized sessions with eligible bulk recording counts', async () => {
  await seed(`INSERT INTO attendance_records VALUES($1,$2,$3,$4,'2026-10-26',$5,'one'),($6,$2,$3,$4,'2026-10-26',$5,'one');`,[school,student,klass,year,publication,otherSchool]);
  const result = await teacherWorkspace(database,actor,now);
  expect(result).toMatchObject({ date: '2026-10-26', timezone: 'Africa/Casablanca', pendingAttendance: 1, homeworkReview: 0 });
  expect(result.lessons.map(l => [l.lessonKey,l.expected,l.recorded,l.writable])).toEqual([['one',2,1,true],['future',2,0,false]]);
  expect(mock.sessions).toHaveBeenCalledWith(database,actor,{date:'2026-10-26'},now);
  expect(result.lessons[0]).not.toHaveProperty('studentId');
});
it('counts only manageable, eligible and upload-ready submitted work, never another teacher/school or reviewed work', async () => {
  for (let i=0;i<8;i++) {
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(i+1).padStart(12,'0')}`, tenant=i===6?otherSchool:school;
    await seed(`INSERT INTO homework VALUES($1,$2,$3,$4,'2026-10-30',$5); INSERT INTO homework_targets VALUES($1,$2,$1,$3,$6); INSERT INTO homework_submissions VALUES($1,$2,$1,$7,$8);`,[id,tenant,year,subject,i===4?'ARCHIVED':'PUBLISHED',i===2?otherClass:klass,student,i===3?'REVIEWED':i===1?'LATE':'SUBMITTED']);
    if(i===2) await seed(`INSERT INTO student_enrollments VALUES($1,$2,$3,$4,$5,'2026-09-01',null,'ACTIVE')`,[id,school,student,year,otherClass]);
    if(i===5) await seed(`INSERT INTO files VALUES($1,'UPLOADING'); INSERT INTO homework_submission_attachments VALUES($1,$2,$1,$1)`,[id,school]);
    if(i===7) await seed(`INSERT INTO homework_targets VALUES($1,$2,$1,$3,$4)`,[id,school,year,otherClass]);
  }
  expect(await teacherReviewCount(database,actor)).toBe(2);
  expect(await teacherReviewCount(database,{schoolId:school,userId:otherUser})).toBe(1);
  expect(await teacherReviewCount(database,{schoolId:otherSchool,userId:user})).toBe(0);
});
it('never derives write permission from ongoing status and preserves completed read actions', () => {
  expect(teacherAttendanceAction(lesson)).toBe('record'); expect(teacherAttendanceAction({...lesson,recorded:1})).toBe('continue');
  expect(teacherAttendanceAction({...lesson,writable:false})).toBe('viewAttendance'); expect(teacherAttendanceAction({...lesson,status:'completed'})).toBe('viewAttendance');
  expect(teacherAttendanceAction({...lesson,status:'upcoming',writable:true})).toBe('timetable'); expect(teacherAttendanceAction({...lesson,expected:0})).toBe('viewAttendance');
  expect(nextTeacherLesson([{...lesson,status:'completed'},{...lesson,status:'upcoming'},lesson])).toBe(lesson); expect(nextTeacherLesson([{...lesson,status:'completed'}])).toBeNull();
});
it('uses school timezone and fails closed on ambiguous wall time', () => { expect(teacherLessonStatus('2026-10-26','09:30','10:30','Africa/Casablanca',now)).toBe('completed'); expect(teacherLessonStatus('2026-11-01','01:30','02:30','America/New_York',now)).toBe('unavailable'); });
it('validates navigation hints without treating them as authority', () => { expect(teacherSessionHint(new URLSearchParams({date:'2026-10-26',publicationId:publication,lessonKey:'one'}),'2026-10-26')).toEqual({date:'2026-10-26',selected:`${publication}:one`}); expect(teacherSessionHint(new URLSearchParams({date:'2099-01-01',publicationId:publication,lessonKey:'one'}),'2026-10-26')).toBeNull(); expect(teacherSessionHint(new URLSearchParams('schoolId=other'),'2026-10-26')).toBeNull(); });
