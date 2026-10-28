import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import * as schema from '@school/database';
const mock = vi.hoisted(() => ({ authorize: vi.fn(), outstanding: vi.fn(), collections: vi.fn() }));
vi.mock('@/lib/authorization/server', () => ({ requireOperation: mock.authorize }));
vi.mock('@/lib/modules/finance/application/reports', () => ({ outstandingReport: mock.outstanding, collectionsReport: mock.collections }));
import { adminOverview, lessonStatus, recordingStatus, workspaceContext } from '@/lib/modules/dashboard/overview';
const pg = new PGlite(), db = drizzle(pg, { schema });
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', Y='33333333-3333-4333-8333-333333333333', Z='44444444-4444-4444-8444-444444444444', C='55555555-5555-4555-8555-555555555555', D='66666666-6666-4666-8666-666666666666', P='77777777-7777-4777-8777-777777777777';
const actor={schoolId:A,userId:B}, now=new Date('2026-10-26T12:00:00Z');
const database=db as unknown as Parameters<typeof adminOverview>[0];
beforeAll(async()=>{
 await pg.exec(`CREATE TABLE school_holidays(id uuid, school_id uuid, name text, type text, start_date date, end_date date, description text, revision int, removed_at timestamptz); CREATE TABLE schools(id uuid, timezone text, status text); CREATE TABLE academic_years(id uuid,school_id uuid,name text,status text,start_date date,end_date date); CREATE TABLE classes(id uuid,school_id uuid,academic_year_id uuid,name text,status text); CREATE TABLE teachers(id uuid,school_id uuid,status text); CREATE TABLE student_enrollments(id uuid,school_id uuid,student_id uuid,academic_year_id uuid,class_id uuid,effective_from date,effective_until date,status text); CREATE TABLE attendance_records(school_id uuid,student_id uuid,class_id uuid,academic_year_id uuid,attendance_date date,publication_id uuid,lesson_key text); CREATE TABLE timetable_publications(id uuid,school_id uuid,academic_year_id uuid,class_id uuid,draft_id uuid,sequence int,effective_from date,valid_until date,snapshot jsonb,request_key uuid,request_hash text,published_by uuid,published_at timestamptz);`);
 await pg.query(`INSERT INTO schools VALUES ($1,'UTC','ACTIVE'),($2,'UTC','ACTIVE');`,[A,B]);
 await pg.query(`INSERT INTO academic_years VALUES ($1,$2,'Current A','ACTIVE','2026-09-01','2027-06-30'),($3,$4,'Private B','ACTIVE','2026-09-01','2027-06-30');`,[Y,A,Z,B]);
 await pg.query(`INSERT INTO classes VALUES ($1,$2,$3,'A1','ACTIVE'),($4,$2,$3,'A2','ACTIVE'),($5,$6,$7,'Private','ACTIVE');`,[C,A,Y,D,P,B,Z]);
 await pg.query(`INSERT INTO teachers VALUES ($1,$2,'ACTIVE'),($3,$4,'ACTIVE');`,[C,A,D,B]);
 for(let i=1;i<=5;i++){const student=`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`;await pg.query(`INSERT INTO student_enrollments VALUES ($1,$2,$1,$3,$4,$5,$6,$7)`,[student,A,Y,C,i===4?'2026-11-01':'2026-09-01',i===5?'2026-10-01':null,i===5?'ENDED':'ACTIVE']);if(i<=3||i===4)await pg.query(`INSERT INTO attendance_records VALUES ($1,$2,$3,$4,'2026-10-26',$5,'done')`,[A,student,C,Y,P]);}
 await pg.query(`INSERT INTO student_enrollments VALUES ($1,$2,$1,$3,$4,'2026-09-01',null,'ACTIVE')`,[P,B,Z,P]);
 const snapshot={className:'A1',yearName:'Current A',periodName:'Term',timezone:'UTC',lessons:[['done','08:00','09:00'],['pending','10:00','11:00'],['future','14:00','15:00']].map(([lessonKey,start,end])=>({lessonKey,start,end,weekday:1,subjectId:C,subjectName:'Math',teacherAssignmentId:C,teacherId:C,teacherName:'Test Teacher',roomId:null,roomName:null}))};
 await pg.query(`INSERT INTO timetable_publications VALUES ($1,$2,$3,$4,$1,1,'2026-10-01','2027-01-01',$5,$1,'hash',$1,now())`,[P,A,Y,C,JSON.stringify(snapshot)]);
 mock.outstanding.mockResolvedValue({currency:'EUR',summary:{outstandingCents:12345,days1to30Cents:100,days31to60Cents:200,days61plusCents:300,overdueStudents:2}});mock.collections.mockResolvedValue({netCents:7890});
});
afterAll(()=>pg.close());
it('uses school-scoped effective enrollment, immutable publications and complete eligible rosters',async()=>{
 const result=await adminOverview(database,actor,undefined,now);
 expect(result.selectedYear?.id).toBe(Y);expect(result.metrics).toMatchObject({enrolled:3,classes:2,teachers:1,pending:1,recorded:1,missingTimetable:1,currency:'EUR',outstandingCents:12345,overdueCents:600,overdueStudents:2,collectedCents:7890});
 expect(result.lessons.map(l=>[l.lessonKey,l.recorded,l.recording])).toEqual([['done',3,'recorded'],['pending',0,'pending'],['future',0,'upcoming']]);
 expect(mock.outstanding).toHaveBeenCalledWith(database,actor,{academicYearId:Y},now);expect(mock.collections).toHaveBeenCalledWith(database,actor,{from:'2026-10-01',to:'2026-10-26'},now);
 expect(mock.authorize).toHaveBeenCalledWith(database,actor,{permission:'finance.read',scope:{kind:'school'}});
});
it('cannot select another school’s year or disclose its counts',async()=>{await expect(adminOverview(database,actor,Z,now)).rejects.toThrow();expect((await workspaceContext(database,actor,now)).academicYear?.name).toBe('Current A');});
it('fails closed on ambiguous academic context instead of inventing a current year',async()=>{
 await pg.query(`INSERT INTO academic_years VALUES ($1,$2,'Overlap','ACTIVE','2026-09-01','2027-06-30')`,[P,A]);
 expect((await workspaceContext(database,actor,now)).academicYear).toBeNull();expect((await adminOverview(database,actor,undefined,now)).metrics).toBeNull();
});
it('does not confuse missing recording, future sessions or an empty roster with absence',()=>{expect(recordingStatus('completed',20,19)).toBe('pending');expect(recordingStatus('completed',0,0)).toBe('noRoster');expect(recordingStatus('upcoming',20,0)).toBe('upcoming');expect(lessonStatus('2026-11-01','01:30','02:30','America/New_York',now)).toBe('unavailable');});
