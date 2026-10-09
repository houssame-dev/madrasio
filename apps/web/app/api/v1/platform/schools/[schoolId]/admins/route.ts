import { parseBody } from '@/lib/api/errors';
import { platformResponse, platformInviteDependencies } from '@/lib/modules/platform/http';
import { establishSchoolAdmin, listSchoolAdmins } from '@/lib/modules/platform/service';
import { adminInput } from '@/lib/modules/platform/contracts';
type Context = { params: Promise<{ schoolId: string }> };
export async function GET(_request: Request, context: Context) {
  return platformResponse(async (db, actor) => ({
    data: await listSchoolAdmins(db, actor, (await context.params).schoolId),
  }));
}
export async function POST(request: Request, context: Context) {
  return platformResponse(async (db, actor) => {
    const input = await parseBody(request, adminInput);
    return {
      data: await establishSchoolAdmin(
        platformInviteDependencies(db),
        actor,
        (await context.params).schoolId,
        input,
      ),
    };
  });
}
