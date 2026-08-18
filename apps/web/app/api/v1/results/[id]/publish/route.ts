import { z } from 'zod';

import { parseBody, toResultErrorResponse } from '@/lib/api/results';
import { getSessionUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { publishResult } from '@/lib/modules/grades/application';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  schoolId: z.string().uuid(),
  resultType: z.enum(['SUBJECT', 'PERIOD', 'ANNUAL']),
  idempotencyKey: z.string().uuid(),
  revision: z.boolean().optional().default(false),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    const { id } = await context.params;
    const userId = await getSessionUserId();

    const result = await publishResult(getDb(), {
      userId,
      schoolId: body.schoolId,
      resultType: body.resultType,
      resultId: id,
      idempotencyKey: body.idempotencyKey,
      revision: body.revision,
    });

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return toResultErrorResponse(error);
  }
}