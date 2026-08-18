import { z } from 'zod';

import { parseBody, toResultErrorResponse } from '@/lib/api/results';
import { getSessionUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { calculatePeriodResult } from '@/lib/modules/grades/application';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  schoolId: z.string().uuid(),
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  academicPeriodId: z.string().uuid(),
  classId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    const userId = await getSessionUserId();

    const result = await calculatePeriodResult(getDb(), {
      userId,
      schoolId: body.schoolId,
      studentId: body.studentId,
      academicYearId: body.academicYearId,
      academicPeriodId: body.academicPeriodId,
      classId: body.classId,
    });

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return toResultErrorResponse(error);
  }
}