import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ForbiddenError,ValidationError } from '@/lib/errors';
import { toApiErrorResponse } from '@/lib/api/errors';
import { parentTuition,parentReceipt } from '@/lib/modules/finance/application/parent-reads';
import { parentReceiptDocument } from '@/lib/modules/finance/domain/parent-receipt';
import { getLocale } from 'next-intl/server';
type Route={params:Promise<{studentId:string;paymentId?:string}>};
async function read(request:Request,route:Route,receipt:boolean) {
  let response:Response;
  try {
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(k=>query.getAll(k).length!==1))throw new ValidationError('Repeated query parameter.');
    const filter=(receipt?z.object({download:z.enum(['1']).optional()}):z.object({page:z.coerce.number().int().min(1).max(100000).default(1)})).strict().safeParse(Object.fromEntries(query));
    const params=await route.params,student=z.string().uuid().safeParse(params.studentId),payment=receipt?z.string().uuid().safeParse(params.paymentId):null;
    if(!filter.success||!student.success||(receipt&&!payment?.success))throw new ValidationError('Invalid child tuition request.');
    const db=getDb(),context=await requireCurrentContext(db);
    if(context.role!=='PARENT'||!context.schoolContext)throw new ForbiddenError();
    const actor={schoolId:context.schoolContext.schoolId,userId:context.userId};
    if(receipt&&payment?.success){
      const data=await parentReceipt(db,actor,student.data,payment.data);
      if(query.get('download')==='1'){
        const locale=await getLocale();response=new Response(parentReceiptDocument(data,locale==='ar'?'ar':locale==='fr'?'fr':'en'),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="receipt-${payment.data}.html"`,'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
      }else response=Response.json({data});
    }else response=Response.json({data:await parentTuition(db,actor,student.data,Number(query.get('page')??1))});
  }catch(error){response=toApiErrorResponse(error);}
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
}
export const GET=(request:Request,context:Route)=>read(request,context,false);
export const receiptGET=(request:Request,context:Route)=>read(request,context,true);
