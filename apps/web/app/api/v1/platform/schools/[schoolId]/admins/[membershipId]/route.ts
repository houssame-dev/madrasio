import { parseBody } from '@/lib/api/errors';
import { getAuthAdmin } from '@/lib/auth/admin';
import { platformResponse } from '@/lib/modules/platform/http';
import { changeSchoolAdminStatus } from '@/lib/modules/platform/service';
import { membershipInput } from '@/lib/modules/platform/contracts';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ schoolId: string; membershipId: string }> },
) {
  return platformResponse(async (db, actor) => {
    const { schoolId, membershipId } = await context.params;
    const input = await parseBody(request, membershipInput);
    return {
      data: await changeSchoolAdminStatus(
        { db, authAdmin: getAuthAdmin() },
        actor,
        schoolId,
        membershipId,
        input,
      ),
    };
  });
}
