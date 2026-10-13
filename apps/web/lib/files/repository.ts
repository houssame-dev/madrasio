import { and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@school/database';
const { files } = schema;
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export async function markFileReady(db: Db, schoolId: string, fileId: string) {
  const [row] = await db.update(files).set({ state: 'READY', updatedAt: new Date() })
    .where(and(eq(files.schoolId, schoolId), eq(files.id, fileId), eq(files.state, 'UPLOADING'))).returning();
  return row;
}
export async function findFile(db: Db, schoolId: string, fileId: string) {
  const [row] = await db.select().from(files).where(and(eq(files.schoolId, schoolId), eq(files.id, fileId)));
  return row;
}
export async function markFileRejected(db: Db, schoolId: string, fileId: string) {
  await db.update(files).set({ state: 'REJECTED', updatedAt: new Date() })
    .where(and(eq(files.schoolId, schoolId), eq(files.id, fileId), eq(files.state, 'UPLOADING')));
}
