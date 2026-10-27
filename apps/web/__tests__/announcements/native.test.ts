// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as schema from '@school/database';
import * as app from '@/lib/modules/announcements/application';
import { processNotificationEvent } from '@/lib/modules/notifications/application/process-notification-event';
import * as files from '@/lib/modules/announcements/application/announcement-attachments';
import {
  createAnnouncementsTestDb,
  seedSchool,
  seedUser,
  seedParent,
  seedStudent,
  seedEnrollment,
  seedParentStudent,
  type AnnouncementsTestDb,
  type SeededSchool,
} from './test-helpers';

import {
  assertRecoveryInventory,
  fingerprintTable,
  loadForeignKeys,
  type QualifiedTable,
} from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
const port = process.env.COMMUNICATIONS_LOCAL_PG_PORT;
describe.skipIf(!port)(
  'native PostgreSQL Announcements serialization, Outbox and private metadata',
  () => {
    const pool = new Pool({
      host: '127.0.0.1',
      port: Number(port),
      database: 'communications_test',
      user: 'postgres',
      ssl: false,
      max: 6,
      options: '-c timezone=UTC',
      connectionTimeoutMillis: 5000,
      statement_timeout: 20000,
    });
    const db = drizzle(pool, { schema });
    let test: AnnouncementsTestDb,
      school: SeededSchool,
      order: QualifiedTable[],
      actor: { schoolId: string; userId: string },
      parent: typeof actor;
    beforeAll(async () => {
      if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535)
        throw Error('Invalid owned loopback port');
      expect(
        (await pool.query('select current_database() name,version() version')).rows[0],
      ).toMatchObject({ name: 'communications_test', version: expect.stringContaining('17.6') });
      expect(
        (await pool.query("select tablename from pg_tables where schemaname='public'")).rows,
      ).toEqual([]);
      await pool.query(
        'create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;',
      );
      await migrate(db, {
        migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations'),
      });
      test = await createAnnouncementsTestDb();
      school = await seedSchool(test.seed);
      actor = {
        schoolId: school.schoolId,
        userId: await seedUser(test.seed, school.schoolId, 'SCHOOL_ADMIN'),
      };
      parent = {
        schoolId: school.schoolId,
        userId: await seedUser(test.seed, school.schoolId, 'PARENT'),
      };
      const parentId = await seedParent(test.seed, school.schoolId, parent.userId),
        child = await seedStudent(test.seed, school.schoolId);
      await seedEnrollment(test.seed, school.schoolId, child, school.yearId, school.classAId);
      await seedParentStudent(test.seed, school.schoolId, parentId, child);
      await test.client.exec(
        "set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));",
      );
      const reader = test.client as unknown as QueryClient;
      await assertRecoveryInventory(reader);
      order = buildRestoreOrder(await loadForeignKeys(reader));
      expect(order).toHaveLength(59);
      for (const table of order) {
        const rows = (
          await reader.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)
        ).rows.map((r) => r.row);
        if (rows.length)
          await pool.query(
            `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,
            [JSON.stringify(rows)],
          );
      }
      for (const table of order)
        expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(reader, table));
    }, 60000);
    afterAll(async () => {
      await test?.client.close();
      await pool.end();
    });
    async function draft() {
      const value = await app.createAnnouncement(db, actor, {
        title: 'Native local notice',
        body: 'Immutable body',
      });
      await app.addAnnouncementTargets(db, actor, value.announcement.id, {
        announcementVersionId: value.version.id,
        targets: [
          {
            audience: 'PARENTS',
            targetType: 'CLASS',
            academicYearId: school.yearId,
            classId: school.classAId,
          },
        ],
      });
      return {
        ...value,
        input: {
          ...actor,
          announcementId: value.announcement.id,
          announcementVersionId: value.version.id,
          idempotencyKey: randomUUID(),
        },
      };
    }
    async function due(value: Awaited<ReturnType<typeof draft>>) {
      const intent = await app.publishAnnouncement(db, {
        ...value.input,
        scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      });
      await pool.query(
        "update announcement_publications set scheduled_at=now()-interval '1 minute' where id=$1",
        [intent.publicationId],
      );
      return intent;
    }
    it('serializes duplicate publication and event processing with exact frozen recipients', async () => {
      const value = await draft();
      const results = await Promise.all([
        app.publishAnnouncement(db, value.input),
        app.publishAnnouncement(db, value.input),
      ]);
      expect(new Set(results.map((x) => x.publicationId)).size).toBe(1);
      expect((await pool.query('select * from publication_recipient_snapshots')).rows).toHaveLength(
        1,
      );
      const events = (await pool.query('select * from outbox_events')).rows;
      expect(events).toHaveLength(1);
      // Change the current relationship after publication: event retries must use frozen recipients.
      await pool.query("update parent_students set status='ENDED'");
      await processNotificationEvent(db, { outboxEventId: events[0].id });
      await processNotificationEvent(db, { outboxEventId: events[0].id });
      expect((await pool.query('select * from notifications')).rows).toHaveLength(1);
      await expect(
        app.addAnnouncementTargets(db, actor, value.announcement.id, {
          announcementVersionId: value.version.id,
          targets: [
            {
              audience: 'PARENTS',
              targetType: 'CLASS',
              academicYearId: school.yearId,
              classId: school.classBId,
            },
          ],
        }),
      ).rejects.toBeDefined();
      await pool.query("update parent_students set status='ACTIVE'");
    });
    it('serializes due publication against cancellation and rescheduling, preserving cancelled freezes', async () => {
      for (const action of ['cancel', 'reschedule'] as const) {
        const value = await draft(),
          intent = await due(value);
        const results = await Promise.allSettled([
          app.publishDueAnnouncement(db, { publicationId: intent.publicationId }),
          app.changeAnnouncementSchedule(
            db,
            actor,
            value.announcement.id,
            intent.publicationId,
            action === 'cancel'
              ? { action }
              : { action, scheduledAt: new Date(Date.now() + 14400000).toISOString() },
          ),
        ]);
        expect(results.some((x) => x.status === 'fulfilled')).toBe(true);
        const row = (
          await pool.query('select * from announcement_publications where id=$1', [
            intent.publicationId,
          ])
        ).rows[0];
        const count = (
          await pool.query(
            'select * from publication_recipient_snapshots where publication_id=$1',
            [row.id],
          )
        ).rows.length;
        expect(count).toBe(row.status === 'PUBLISHED' ? 1 : 0);
        expect(['PUBLISHED', 'CANCELLED', 'SCHEDULED']).toContain(row.status);
        await expect(
          app.removeAnnouncementTarget(
            db,
            actor,
            value.announcement.id,
            value.version.id,
            randomUUID(),
          ),
        ).rejects.toBeDefined();
      }
    });
    it('keeps exact-Version private files ready, idempotent and frozen, with transactional Outbox rollback', async () => {
      const value = await draft(),
        objects = new Map<string, Uint8Array>();
      const store = {
        put: vi.fn(async (key: string, bytes: Uint8Array) => {
          objects.set(key, bytes);
        }),
        get: vi.fn(async (key: string) => objects.get(key)!),
        delete: vi.fn(async (key: string) => {
          objects.delete(key);
        }),
      };
      const request = {
        requestId: randomUUID(),
        name: 'notice.pdf',
        mediaType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.7 local native fixture'),
      };
      const file = await files.uploadAnnouncementAttachment(
        db,
        store,
        actor,
        value.announcement.id,
        value.version.id,
        request,
      );
      expect(file.state).toBe('READY');
      expect(
        await files.uploadAnnouncementAttachment(
          db,
          store,
          actor,
          value.announcement.id,
          value.version.id,
          request,
        ),
      ).toEqual(file);
      expect(store.put).toHaveBeenCalledOnce();
      await app.publishAnnouncement(db, value.input);
      await expect(
        files.removeAnnouncementAttachment(
          db,
          actor,
          value.announcement.id,
          value.version.id,
          file.id,
        ),
      ).rejects.toBeDefined();
      expect(
        await files.downloadManagedAttachment(
          db,
          store,
          actor,
          value.announcement.id,
          value.version.id,
          file.id,
        ),
      ).toMatchObject({ bytes: request.bytes });
      const before = (await pool.query('select count(*)::int count from announcement_publications'))
        .rows[0].count;
      const fresh = await draft();
      await pool.query(
        "create function local_reject_event() returns trigger language plpgsql as $$ begin raise exception 'local rollback fixture'; end; $$; create trigger local_reject_event before insert on outbox_events for each row execute function local_reject_event();",
      );
      await expect(app.publishAnnouncement(db, fresh.input)).rejects.toBeDefined();
      expect(
        (await pool.query('select count(*)::int count from announcement_publications')).rows[0]
          .count,
      ).toBe(before);
      await pool.query(
        'drop trigger local_reject_event on outbox_events;drop function local_reject_event();',
      );
    });
  },
);
