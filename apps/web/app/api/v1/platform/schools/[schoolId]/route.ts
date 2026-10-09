import { platformResponse } from '@/lib/modules/platform/http';
import { openPlatformSchool } from '@/lib/modules/platform/service';
export async function GET(_request: Request, context: { params: Promise<{ schoolId: string }> }) {
  return platformResponse(async (db, actor) => ({
    data: await openPlatformSchool(db, actor, (await context.params).schoolId),
  }));
}
