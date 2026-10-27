import { z } from 'zod';
import { requireCurrentContext } from '@/lib/auth/require-context';
import { getDb } from '@/lib/db/client';
import { ValidationError,ForbiddenError } from '@/lib/errors';
import { toApiErrorResponse } from '@/lib/api/errors';
import { tuitionOverview } from '@/lib/modules/finance/application/overview';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  let response:Response;
  try {
    const p=new URL(request.url).searchParams;
    if([...p.keys()].some(k=>p.getAll(k).length!==1))throw new ValidationError('Repeated filter.');
    const filter=z.object({academicYearId:z.string().uuid().optional()}).strict().safeParse(Object.fromEntries(p));
    if(!filter.success)throw new ValidationError('Invalid overview filters.');
    const db=getDb(),context=await requireCurrentContext(db);
    if(context.role!=='SCHOOL_ADMIN'||!context.schoolContext)throw new ForbiddenError();
    response=Response.json({data:await tuitionOverview(db,{schoolId:context.schoolContext!.schoolId,userId:context.userId},filter.data.academicYearId)});
  }catch(error){response=toApiErrorResponse(error);}
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
}
