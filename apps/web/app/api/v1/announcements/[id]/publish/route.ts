/**
 * POST /api/v1/announcements/:id/publish (Task 011).
 *
 * Publishes EXACTLY one AnnouncementVersion of the Announcement. The route is
 * intentionally thin: body parsing + session identity + delegation to the
 * `publishAnnouncement` use case. All authorization, business rules, recipient
 * resolution, tenant isolation and outbox persistence happen server-side in
 * the use case (CLAUDE.md §16/§25/§26). No broad Announcements CRUD API exists
 * in V1.
 */

import { z } from 'zod';

import { parseBody, toAnnouncementErrorResponse } from '@/lib/api/announcements';
import { getSessionUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { publishAnnouncement } from '@/lib/modules/announcements/application';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  schoolId: z.string().uuid(),
  announcementVersionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    const { id } = await context.params;
    const userId = await getSessionUserId();

    const result = await publishAnnouncement(getDb(), {
      userId,
      schoolId: body.schoolId,
      announcementId: id,
      announcementVersionId: body.announcementVersionId,
      idempotencyKey: body.idempotencyKey,
      scheduledAt: body.scheduledAt,
    });

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return toAnnouncementErrorResponse(error);
  }
}