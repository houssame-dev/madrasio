import 'server-only';
import { and,eq,sql,asc } from 'drizzle-orm';
import * as s from '@school/database';
import type { FinanceDb,FinanceActor } from './service';
import { paymentHistory } from './payments';
import { outstandingReport,collectionsReport,exactCents } from './reports';
export async function tuitionOverview(db:FinanceDb,actor:FinanceActor,academicYearId?:string,now=new Date()) {
  return db.transaction(async tx=>{
  const scoped=tx as unknown as FinanceDb;
  // Existing report guard runs before any extra school-scoped aggregation.
  const outstanding=await outstandingReport(scoped,actor,{academicYearId},now);
  const today=outstanding.today;
  const collections=await collectionsReport(scoped,actor,{from:today.slice(0,7)+'-01',to:today},now);
  const history=await paymentHistory(scoped,actor);
  const c=s.studentCharges,remaining=sql`${c.originalCents}-${c.reductionCents}-${c.allocatedCents}`;
  const scope=and(eq(c.schoolId,actor.schoolId),eq(c.status,'OPEN'),academicYearId?eq(c.academicYearId,academicYearId):undefined);
  const [overdue,byClass]=await Promise.all([
    scoped.select({studentId:c.studentId,studentName:sql<string>`${s.students.firstName}||' '||${s.students.lastName}`,balance:sql<string>`sum(${remaining})::text`,dueDate:sql<string>`min(${c.dueDate})::text`}).from(c).innerJoin(s.students,and(eq(s.students.schoolId,c.schoolId),eq(s.students.id,c.studentId))).where(and(scope,sql`${remaining}>0`,sql`${c.dueDate}<${today}::date`)).groupBy(c.studentId,s.students.firstName,s.students.lastName).orderBy(sql`sum(${remaining}) desc`,asc(c.studentId)).limit(6),
    scoped.select({classId:c.classId,className:s.classes.name,balance:sql<string>`sum(${remaining})::text`}).from(c).innerJoin(s.classes,and(eq(s.classes.schoolId,c.schoolId),eq(s.classes.id,c.classId))).where(and(scope,sql`${remaining}>0`)).groupBy(c.classId,s.classes.name).orderBy(sql`sum(${remaining}) desc`,asc(c.classId)).limit(6),
  ]);
  return {today,timezone:outstanding.timezone,currency:outstanding.currency,summary:outstanding.summary,collections:{netCents:collections.netCents,cashCents:collections.cashCents,bankCents:collections.bankCents,chequeCents:collections.chequeCents},recent:history.items.slice(0,6).map(({payment,reversal})=>({id:payment.id,studentId:payment.studentId,studentName:payment.studentName,receivedOn:payment.receivedOn,method:payment.method,amountCents:payment.amountCents,receiptReference:payment.receiptReference,reversalReference:reversal?.reversalReference??null})),overdue:overdue.map(r=>({...r,balance:exactCents(r.balance)})),byClass:byClass.map(r=>({...r,balance:exactCents(r.balance)}))};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
}
