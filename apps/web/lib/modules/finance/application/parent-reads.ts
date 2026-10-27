import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import * as s from '@school/database';
import { authorizeChild } from '@/lib/modules/parents/application/parent-child-read-service';
import type { ParentsDb } from '@/lib/modules/parents/infrastructure/repositories/parent-repository';
import type { FinanceDb, FinanceActor } from './service';
import { NotFoundError } from '@/lib/errors';
import { exactCents } from './reports';
import { schoolToday } from '../domain/contracts';

const paymentFields = { id:s.financePayments.id,receiptReference:s.financePayments.receiptReference,schoolName:s.financePayments.schoolName,schoolTimezone:s.financePayments.schoolTimezone,studentName:s.financePayments.studentName,receivedOn:s.financePayments.receivedOn,method:s.financePayments.method,currency:s.financePayments.currency,amountCents:s.financePayments.amountCents,reference:s.financePayments.reference };
const reversalFields = { reversalReference:s.financeReversals.reversalReference,reversedAt:s.financeReversals.reversedAt };
const chargeFields = { id:s.studentCharges.id,feeName:s.studentCharges.feeName,period:s.studentCharges.period,dueDate:s.studentCharges.dueDate,status:s.studentCharges.status,currency:s.studentCharges.currency,originalCents:s.studentCharges.originalCents,reductionCents:s.studentCharges.reductionCents,allocatedCents:s.studentCharges.allocatedCents };
/** Dedicated Parent exception: never grant finance.read or call Admin services with substituted actors. */
export async function parentTuition(db:FinanceDb,actor:FinanceActor,studentId:string,page=1,now=new Date()) {
  return db.transaction(async tx=>{
    await authorizeChild(tx as unknown as ParentsDb,actor,studentId);
    const [school]=await tx.select({currency:s.schools.financeCurrency,timezone:s.schools.timezone}).from(s.schools).where(eq(s.schools.id,actor.schoolId));
    const c=s.studentCharges,p=s.financePayments,r=s.financeReversals;
    const scope=and(eq(c.schoolId,actor.schoolId),eq(c.studentId,studentId));
    const [totals]=await tx.select({ net:sql<string>`coalesce(sum(case when ${c.status}='OPEN' then ${c.originalCents}-${c.reductionCents} else 0 end),0)::text`,paid:sql<string>`coalesce(sum(case when ${c.status}='OPEN' then ${c.allocatedCents} else 0 end),0)::text`,count:sql<number>`count(*)::int` }).from(c).where(scope);
    const [charges,payments,[paymentCount]]=await Promise.all([
      tx.select(chargeFields).from(c).where(scope).orderBy(asc(c.dueDate),asc(c.id)).limit(20).offset((page-1)*20),
      tx.select({payment:paymentFields,reversal:reversalFields}).from(p).leftJoin(r,and(eq(r.schoolId,p.schoolId),eq(r.paymentId,p.id),eq(r.studentId,studentId))).where(and(eq(p.schoolId,actor.schoolId),eq(p.studentId,studentId))).orderBy(desc(p.receivedOn),desc(p.recordedAt),asc(p.id)).limit(20).offset((page-1)*20),
      tx.select({count:sql<number>`count(*)::int`}).from(p).where(and(eq(p.schoolId,actor.schoolId),eq(p.studentId,studentId))),
    ]);
    const netCents=exactCents(totals.net),paidCents=exactCents(totals.paid);
    return {currency:school.currency,today:schoolToday(school.timezone,now),studentId,summary:{netCents,paidCents,outstandingCents:netCents-paidCents},charges,payments,chargeTotal:totals.count,paymentTotal:paymentCount.count,page};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
}
export async function parentReceipt(db:FinanceDb,actor:FinanceActor,studentId:string,paymentId:string) {
  return db.transaction(async tx=>{
    await authorizeChild(tx as unknown as ParentsDb,actor,studentId);
    const p=s.financePayments,a=s.financeAllocations,r=s.financeReversals;
    const [payment]=await tx.select(paymentFields).from(p).where(and(eq(p.schoolId,actor.schoolId),eq(p.studentId,studentId),eq(p.id,paymentId)));
    if(!payment)throw new NotFoundError();
    const [allocations,[reversal]]=await Promise.all([
      tx.select({id:a.id,feeName:a.feeName,period:a.period,dueDate:a.dueDate,currency:a.currency,amountCents:a.amountCents}).from(a).where(and(eq(a.schoolId,actor.schoolId),eq(a.studentId,studentId),eq(a.paymentId,paymentId))).orderBy(asc(a.dueDate),asc(a.id)),
      tx.select(reversalFields).from(r).where(and(eq(r.schoolId,actor.schoolId),eq(r.studentId,studentId),eq(r.paymentId,paymentId))),
    ]);
    return {payment,allocations,reversal:reversal??null};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
}
