// @vitest-environment node
import { beforeAll,afterAll,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createGradesTestDb,seedSchool,seedStudentAndActors,seedParentActor } from '../grades/test-helpers';
import { saveFeeType,saveStructure,previewCharges,generateCharges,type FinanceDb,listFinance } from '@/lib/modules/finance/application/service';
import { recordPayment,reversePayment } from '@/lib/modules/finance/application/payments';
import { parentTuition,parentReceipt } from '@/lib/modules/finance/application/parent-reads';
import { parentReceiptDocument } from '@/lib/modules/finance/domain/parent-receipt';
import { tuitionOverview } from '@/lib/modules/finance/application/overview';
let test:Awaited<ReturnType<typeof createGradesTestDb>>,db:FinanceDb,school:Awaited<ReturnType<typeof seedSchool>>,actors:Awaited<ReturnType<typeof seedStudentAndActors>>,parent:{userId:string;schoolId:string},admin:{userId:string;schoolId:string},parentId:string,relationshipId:string,chargeId:string,paymentId:string;
const now=new Date('2025-11-01T12:00:00Z');
beforeAll(async()=>{
  test=await createGradesTestDb();db=test.seed as unknown as FinanceDb;school=await seedSchool(test.seed);actors=await seedStudentAndActors(test.seed,school.schoolId,school.yearId,school.classId);admin={userId:actors.schoolAdminUserId,schoolId:school.schoolId};
  const pa=await seedParentActor(test.seed,school.schoolId);parent={userId:pa.parentUserId,schoolId:school.schoolId};
  const [profile]=await test.seed.insert(s.parents).values({schoolId:school.schoolId,userId:parent.userId,firstName:'Parent',lastName:'Fixture'}).returning();parentId=profile.id;
  const [link]=await test.seed.insert(s.parentStudents).values({schoolId:school.schoolId,parentId,studentId:actors.studentId}).returning();relationshipId=link.id;
  const type=await saveFeeType(db,admin,{name:'Tuition <script>bad()</script>'});
  const structure=await saveStructure(db,admin,{feeTypeId:type.id,academicYearId:school.yearId,cadence:'ONCE',amountCents:10001,periods:[{period:'once',dueDate:'2025-10-01'}]});
  const input={structureId:structure.id,studentIds:[actors.studentId],periods:['once']},preview=await previewCharges(db,admin,input);
  chargeId=(await generateCharges(db,admin,{...input,previewHash:preview.previewHash,requestKey:randomUUID()})).chargeIds[0];
  paymentId=(await recordPayment(db,admin,{studentId:actors.studentId,method:'CASH',amountCents:6001,receivedOn:'2025-11-01',reference:'Safe external reference',allocations:[{chargeId,amountCents:6001}],confirmed:true,requestKey:randomUUID()},now)).id;
},30000);
afterAll(()=>test?.client.close());
it('reads exact partial balances and safe snapshots without granting broad Finance access',async()=>{
  const d=await parentTuition(db,parent,actors.studentId,1,now);expect(d.summary).toEqual({netCents:10001,paidCents:6001,outstandingCents:4000});expect(d.chargeTotal).toBe(1);expect(d.paymentTotal).toBe(1);
  expect(Object.keys(d.payments[0].payment)).not.toContain('recordedBy');expect(d.charges[0]).not.toHaveProperty('structureId');
  await expect(listFinance(db,parent,{page:1,search:''})).rejects.toThrow();
  const overview=await tuitionOverview(db,admin,school.yearId,now);expect(overview.summary.outstandingCents).toBe(4000);expect(overview.overdue[0].balance).toBe(4000);expect(overview.collections.netCents).toBe(6001);
});
it('authorizes each receipt and exports escaped HTML without staff/audit metadata',async()=>{
  const d=await parentReceipt(db,parent,actors.studentId,paymentId),html=parentReceiptDocument(d,'ar');
  expect(d.payment.amountCents).toBe(6001);expect(d.allocations[0].amountCents).toBe(6001);expect(html).toContain('dir="rtl"');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain(admin.userId);expect(html).not.toContain('recordedBy');
  const [other]=await test.seed.insert(s.students).values({schoolId:school.schoolId,firstName:'Other',lastName:'Linked child'}).returning();
  await test.seed.insert(s.parentStudents).values({schoolId:school.schoolId,parentId,studentId:other.id});
  await expect(parentReceipt(db,parent,other.id,paymentId)).rejects.toThrow();
  await expect(parentReceipt(db,parent,randomUUID(),paymentId)).rejects.toThrow();await expect(parentReceipt(db,parent,actors.studentId,randomUUID())).rejects.toThrow();
  await expect(parentTuition(db,{...parent,schoolId:randomUUID()},actors.studentId)).rejects.toThrow();
});
it('retains immutable receipt history and shows exact restored balances after an authorized reversal',async()=>{
  await reversePayment(db,admin,paymentId,{confirmed:true,requestKey:randomUUID(),reason:'Private staff reversal reason'});
  const d=await parentTuition(db,parent,actors.studentId,1,now),receipt=await parentReceipt(db,parent,actors.studentId,paymentId);
  expect(d.summary.outstandingCents).toBe(10001);expect(receipt.payment.amountCents).toBe(6001);expect(receipt.reversal?.reversalReference).toBeTruthy();expect(receipt.reversal).not.toHaveProperty('reason');expect(receipt.reversal).not.toHaveProperty('reversedBy');expect(parentReceiptDocument(receipt,'en')).not.toContain('Private staff reversal reason');
});
it('fails closed for inactive profiles and ended relationships on balances and direct receipt requests',async()=>{
  await test.seed.update(s.parents).set({status:'INACTIVE'}).where(eq(s.parents.id,parentId));await expect(parentTuition(db,parent,actors.studentId)).rejects.toThrow();await expect(parentReceipt(db,parent,actors.studentId,paymentId)).rejects.toThrow();
  await test.seed.update(s.parents).set({status:'ACTIVE'}).where(eq(s.parents.id,parentId));await test.seed.update(s.parentStudents).set({status:'ENDED'}).where(eq(s.parentStudents.id,relationshipId));await expect(parentTuition(db,parent,actors.studentId)).rejects.toThrow();await expect(parentReceipt(db,parent,actors.studentId,paymentId)).rejects.toThrow();
  await test.seed.update(s.parentStudents).set({status:'ACTIVE'}).where(eq(s.parentStudents.id,relationshipId));
  await test.seed.update(s.schoolMemberships).set({status:'INACTIVE'}).where(eq(s.schoolMemberships.userId,parent.userId));
  await expect(parentTuition(db,parent,actors.studentId)).rejects.toThrow();await expect(parentReceipt(db,parent,actors.studentId,paymentId)).rejects.toThrow();
  await expect(parentTuition(db,{...parent,userId:null},actors.studentId)).rejects.toThrow();
});
