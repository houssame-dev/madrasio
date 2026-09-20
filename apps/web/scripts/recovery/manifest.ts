import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import {
  PINNED_TOOLS,
  PROVIDER_CONTRACT_VERSION,
  RECOVERY_FORMAT,
  RECOVERY_TABLES,
  RecoveryError,
  postgresDiagnostic,
} from './contracts';
import type { TableFingerprint } from './inventory';
import type { AuthColumnContract } from './inventory';
import type { QueryClient } from './snapshot';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z.object({
  filename: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  bytes: z.number().int().nonnegative(),
  sha256,
});
const fingerprintSchema = z.object({
  table: z.string().refine((value) => (RECOVERY_TABLES as readonly string[]).includes(value)),
  rowCount: z.number().int().nonnegative(),
  primaryKeySha256: sha256,
  contentSha256: sha256,
  primaryKeyColumns: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).min(1),
});

export const recoveryManifestSchema = z
  .object({
    format: z.literal(RECOVERY_FORMAT),
    backupId: z.string().regex(/^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{16}$/),
    snapshotAt: z.string().datetime({ offset: true }),
    source: z.object({
      environment: z.enum(['production', 'staging']),
      projectRef: z.string().regex(/^[a-z0-9]{20}$/),
      region: z.literal('eu-central-1'),
    }),
    gitSha: z.string().regex(/^[a-f0-9]{40}$/),
    postgres: z.object({
      serverVersion: z.string().min(1),
      clientVersion: z.literal(PINNED_TOOLS.postgres),
    }),
    migrations: z.object({
      count: z.number().int().nonnegative(),
      latest: z.string().min(1),
      ordered: z.array(z.string().min(1)),
      createdAt: z.array(z.number().int().nonnegative()),
      fileSha256: z.record(sha256),
    }),
    authSchema: z
      .array(
        z.object({
          table: z.enum(['users', 'identities']),
          ordinal: z.number().int().positive(),
          column: z.string(),
          dataType: z.string(),
          udtName: z.string(),
          nullable: z.boolean(),
        }),
      )
      .min(1),
    fingerprints: z.array(fingerprintSchema).length(RECOVERY_TABLES.length),
    lifecycleAggregates: z.record(
      z.string().regex(/^public\.[a-z_][a-z0-9_]*$/),
      z.record(z.number().int().nonnegative()),
    ),
    artifacts: z.array(artifactSchema).min(1),
    encryption: z.object({
      format: z.literal('age'),
      toolVersion: z.literal(PINNED_TOOLS.age),
      recipientFingerprint: sha256,
    }),
    providerContract: z.object({
      version: z.literal(PROVIDER_CONTRACT_VERSION),
      region: z.literal('eu-central-1'),
      appOrigin: z
        .string()
        .url()
        .refine((value) => {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        }),
      dataApi: z.literal('disabled'),
      sslEnforcement: z.literal('required'),
      callbackPath: z.literal('/auth/confirm'),
      passwordMinimum: z.literal(8),
      publicSignup: z.literal(false),
      anonymousSignin: z.literal(false),
      expectedCronJobs: z.literal(2),
      expectedVaultNames: z.array(z.string()).length(2),
      vercel: z.object({
        rootDirectory: z.literal('apps/web'),
        framework: z.literal('nextjs'),
        region: z.literal('fra1'),
      }),
    }),
  })
  .strict();

export type RecoveryManifest = z.infer<typeof recoveryManifestSchema>;
export type { AuthColumnContract };

export function resolveRecoveryMigrationsDirectory(start = process.cwd()): string {
  let directory = resolve(start);
  for (;;) {
    const candidate = join(directory, 'database', 'drizzle', 'migrations');
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) {
      throw new RecoveryError(
        'BACKUP_MIGRATION_METADATA_FAILED',
        'The repository migration contract could not be located.',
        { phase: 'manifest_metadata', timeout: false },
      );
    }
    directory = parent;
  }
}

export function hashBuffer(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createBackupId(snapshotAt: string, gitSha: string): string {
  try {
    const timestamp = new Date(snapshotAt)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    return `${timestamp}-${gitSha.slice(0, 12)}-${randomBytes(8).toString('hex')}`;
  } catch {
    throw new RecoveryError(
      'BACKUP_MANIFEST_VALIDATION_FAILED',
      'The recovery snapshot timestamp is invalid.',
      { phase: 'manifest_validation', timeout: false },
    );
  }
}

export function validateRecoveryManifest(value: unknown): RecoveryManifest {
  const parsed = recoveryManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new RecoveryError(
      'BACKUP_MANIFEST_VALIDATION_FAILED',
      'The recovery manifest does not satisfy the reviewed contract.',
      { phase: 'manifest_validation', timeout: false },
    );
  }
  return parsed.data;
}

export async function loadServerVersion(client: QueryClient): Promise<string> {
  try {
    const result = await client.query<{ server_version: unknown }>('show server_version');
    const rawVersion = result.rows[0]?.server_version;
    if (typeof rawVersion !== 'string') throw new Error('Server version unavailable.');
    const version = rawVersion.trim();
    if (!version) throw new Error('Server version unavailable.');
    return version;
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(
      'BACKUP_SERVER_METADATA_FAILED',
      'PostgreSQL server metadata could not be normalized.',
      postgresDiagnostic(error, 'server_metadata'),
    );
  }
}

export async function writeRecoveryManifest(
  output: string,
  manifest: RecoveryManifest,
): Promise<void> {
  try {
    await writeFile(output, `${canonicalJson(manifest)}\n`, { mode: 0o600 });
  } catch {
    throw new RecoveryError(
      'BACKUP_MANIFEST_WRITE_FAILED',
      'The recovery manifest could not be serialized or written.',
      { phase: 'manifest_write', timeout: false },
    );
  }
}

export function parseRecoveryManifest(value: unknown): RecoveryManifest {
  const parsed = recoveryManifestSchema.safeParse(value);
  if (!parsed.success)
    throw new RecoveryError(
      'RESTORE_MANIFEST_INVALID',
      'Recovery manifest is malformed or unsupported.',
    );
  const tables = parsed.data.fingerprints.map((item) => item.table).sort();
  if (JSON.stringify(tables) !== JSON.stringify([...RECOVERY_TABLES].sort())) {
    throw new RecoveryError(
      'RESTORE_MANIFEST_INVALID',
      'Recovery manifest table inventory is incomplete.',
    );
  }
  return parsed.data;
}

export async function loadMigrationMetadata(migrationsDirectory: string) {
  try {
    const journal = JSON.parse(
      await readFile(join(migrationsDirectory, 'meta', '_journal.json'), 'utf8'),
    ) as { entries?: Array<{ tag: string; when: number }> };
    const ordered = journal.entries?.map((entry) => entry.tag) ?? [];
    const createdAt = journal.entries?.map((entry) => entry.when) ?? [];
    if (!ordered.length) throw new Error('Migration journal is empty.');
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const fileSha256: Record<string, string> = {};
    for (const file of files)
      fileSha256[basename(file)] = hashBuffer(await readFile(join(migrationsDirectory, file)));
    if (
      files.length !== ordered.length ||
      files.some((file, index) => file !== `${ordered[index]}.sql`)
    ) {
      throw new Error('Migration files do not match the ordered journal.');
    }
    return {
      count: ordered.length,
      latest: ordered.at(-1)!,
      ordered,
      createdAt,
      fileSha256,
    };
  } catch {
    throw new RecoveryError(
      'BACKUP_MIGRATION_METADATA_FAILED',
      'The repository migration contract could not be loaded.',
      { phase: 'manifest_metadata', timeout: false },
    );
  }
}

export async function artifactMetadata(path: string) {
  try {
    const details = await stat(path);
    return {
      filename: basename(path),
      bytes: details.size,
      sha256: hashBuffer(await readFile(path)),
    };
  } catch {
    throw new RecoveryError(
      'BACKUP_BUNDLE_CHECKSUM_FAILED',
      'Recovery artifact metadata could not be calculated.',
      { phase: 'bundle_checksum', timeout: false },
    );
  }
}

export function compareFingerprints(
  source: TableFingerprint[],
  restored: TableFingerprint[],
): void {
  if (
    canonicalJson([...source].sort((a, b) => a.table.localeCompare(b.table))) !==
    canonicalJson([...restored].sort((a, b) => a.table.localeCompare(b.table)))
  ) {
    throw new RecoveryError(
      'RESTORE_RECONCILIATION_FAILED',
      'Restored data does not match source fingerprints.',
    );
  }
}
