import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { RECOVERY_TABLES } from '@/scripts/recovery/contracts';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { assertForeignKeyIntegrity, assertIdentityIntegrity, buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { createAnnouncementsTestDb, seedSchool, seedUser, seedAnnouncement } from '../announcements/test-helpers';
import { uploadAnnouncementAttachment, removeAnnouncementAttachment } from '@/lib/modules/announcements/application/announcement-attachments';
import type { PrivateFileStore } from '@/lib/files/storage';

it('replays exact file/association metadata and all 59 fingerprints; makes no claim to recover R2 bytes', async () => {
  const source = await createAnnouncementsTestDb(); const target = await createAnnouncementsTestDb();
  try {
    for (const instance of [source, target]) await instance.client.exec('create table auth.identities (id uuid primary key, user_id uuid not null references auth.users(id))');
    const school = await seedSchool(source.seed); const userId = await seedUser(source.seed, school.schoolId, 'SCHOOL_ADMIN');
    const actor = { userId, schoolId: school.schoolId }; const announcement = await seedAnnouncement(source.seed, school.schoolId, userId);
    const store: PrivateFileStore = { async put() {}, async get() { throw new Error('no byte restore'); }, async delete() {} };
    const item = await uploadAnnouncementAttachment(source.db, store, actor, announcement.announcementId, announcement.versionId,
      { requestId: randomUUID(), name: 'notice.pdf', mediaType: 'application/pdf', bytes: Buffer.from('%PDF-1.7 fixture') });
    const sourceClient = source.client as unknown as QueryClient; const targetClient = target.client as unknown as QueryClient;
    await assertRecoveryInventory(sourceClient); await assertRecoveryInventory(targetClient);
    const originalFile = await fingerprintTable(sourceClient, 'public.files');
    await source.client.query("update files set sha256=$1", ['b'.repeat(64)]);
    expect(await fingerprintTable(sourceClient, 'public.files')).not.toEqual(originalFile);
    const originalAssociation = await fingerprintTable(sourceClient, 'public.announcement_attachments');
    await removeAnnouncementAttachment(source.db, actor, announcement.announcementId, announcement.versionId, item.id);
    expect(await fingerprintTable(sourceClient, 'public.announcement_attachments')).not.toEqual(originalAssociation);
    const order = buildRestoreOrder(await loadForeignKeys(sourceClient)); expect(order).toHaveLength(59);
    expect(order.indexOf('public.announcement_attachments')).toBeGreaterThan(order.indexOf('public.files'));
    expect(order.indexOf('public.announcement_attachments')).toBeGreaterThan(order.indexOf('public.announcement_versions'));
    for (const table of order) {
      expect(RECOVERY_TABLES).toContain(table);
      const { rows } = await source.client.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`);
      if (rows.length) await target.client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map((row) => row.record))]);
    }
    for (const table of order) expect(await fingerprintTable(targetClient, table)).toEqual(await fingerprintTable(sourceClient, table));
    await assertIdentityIntegrity(targetClient); await assertForeignKeyIntegrity(targetClient);
  } finally { await source.client.close(); await target.client.close(); }
}, 30_000);
