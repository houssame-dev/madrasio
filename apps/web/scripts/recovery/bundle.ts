import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { RecoveryError } from './contracts';
import { canonicalJson, hashBuffer } from './manifest';

const MAGIC = Buffer.from('MADRASIO-RECOVERY-V1\n', 'ascii');
type Entry = { name: string; offset: number; bytes: number; sha256: string };

export async function writeRecoveryBundle(output: string, files: string[]): Promise<Entry[]> {
  const names = files.map((file) => basename(file));
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !/^[a-z0-9][a-z0-9._-]*$/.test(name))
  ) {
    throw new RecoveryError(
      'BACKUP_MANIFEST_FAILED',
      'Recovery bundle contains unsafe or duplicate names.',
    );
  }
  const bodies = await Promise.all(files.map((file) => readFile(file)));
  let offset = 0;
  const entries = names.map((name, index) => {
    const entry = { name, offset, bytes: bodies[index].length, sha256: hashBuffer(bodies[index]) };
    offset += entry.bytes;
    return entry;
  });
  const index = Buffer.from(canonicalJson({ entries }), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(index.length);
  await writeFile(output, Buffer.concat([MAGIC, length, index, ...bodies]), { mode: 0o600 });
  return entries;
}

export async function readRecoveryBundle(path: string): Promise<Map<string, Buffer>> {
  const bundle = await readFile(path);
  if (!bundle.subarray(0, MAGIC.length).equals(MAGIC))
    throw new RecoveryError('RESTORE_MANIFEST_INVALID', 'Unknown recovery bundle format.');
  const indexLength = bundle.readUInt32BE(MAGIC.length);
  if (indexLength < 2 || indexLength > 1_048_576)
    throw new RecoveryError('RESTORE_MANIFEST_INVALID', 'Recovery bundle index is unsafe.');
  const bodyStart = MAGIC.length + 4 + indexLength;
  let parsed: { entries?: Entry[] };
  try {
    parsed = JSON.parse(bundle.subarray(MAGIC.length + 4, bodyStart).toString('utf8'));
  } catch {
    throw new RecoveryError('RESTORE_MANIFEST_INVALID', 'Recovery bundle index is malformed.');
  }
  const result = new Map<string, Buffer>();
  if (!parsed.entries?.length || parsed.entries.length > 16)
    throw new RecoveryError('RESTORE_MANIFEST_INVALID', 'Recovery bundle entry count is invalid.');
  for (const entry of parsed.entries) {
    if (
      !/^[a-z0-9][a-z0-9._-]*$/.test(entry.name) ||
      result.has(entry.name) ||
      !Number.isSafeInteger(entry.offset) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.offset < 0 ||
      entry.bytes < 0
    )
      throw new RecoveryError('RESTORE_MANIFEST_INVALID', 'Recovery bundle index is unsafe.');
    const body = bundle.subarray(bodyStart + entry.offset, bodyStart + entry.offset + entry.bytes);
    if (body.length !== entry.bytes || hashBuffer(body) !== entry.sha256)
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Recovery bundle checksum validation failed.',
      );
    result.set(entry.name, body);
  }
  return result;
}
