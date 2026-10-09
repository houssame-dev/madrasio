import { parseBody } from '@/lib/api/errors';
import { platformResponse } from '@/lib/modules/platform/http';
import { createPlatformSchool, listPlatformSchools } from '@/lib/modules/platform/service';
import { schoolInput } from '@/lib/modules/platform/contracts';

export async function GET(request: Request) {
  return platformResponse((db, actor) =>
    listPlatformSchools(db, actor, Number(new URL(request.url).searchParams.get('page') ?? 1)),
  );
}
export async function POST(request: Request) {
  return platformResponse(async (db, actor) => ({
    data: await createPlatformSchool(db, actor, await parseBody(request, schoolInput)),
  }));
}
