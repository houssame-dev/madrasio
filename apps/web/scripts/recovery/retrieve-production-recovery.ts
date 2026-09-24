import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RecoveryError,
  preservePrimaryWithCleanupFailure,
  safeRecoveryError,
} from './contracts';
import {
  assertRecoveryWorkDirectory,
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from './filesystem';
import type { RecoveryObjectStore } from './operations';
import { R2RecoveryObjectStore } from './r2';

const CIPHERTEXT_FILENAME = 'production-recovery.age';

type RetrievalStore = Pick<RecoveryObjectStore, 'head' | 'download'>;

export type RetrievedProductionRecovery = {
  workspacePath: string;
  bundlePath: string;
  objectKey: string;
  bytes: number;
  ciphertextSha256: string;
};

type RetrievalDependencies = {
  store?: RetrievalStore;
  createWorkspace?: typeof createRecoveryWorkDirectory;
  cleanupWorkspace?: typeof cleanupRecoveryWorkDirectory;
};

function retrievalFailure(message: string): RecoveryError {
  return new RecoveryError(
    'BACKUP_REMOTE_VERIFICATION_FAILED',
    message,
    { phase: 'r2_readback', timeout: false },
  );
}

function parseObjectKey(value: string | undefined): string {
  const key = value?.trim() ?? '';

  if (
    key.length > 240 ||
    key.includes('..') ||
    !/^(frequent|weekly)\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[A-Za-z0-9][A-Za-z0-9.-]+\.age$/.test(
      key,
    )
  ) {
    throw retrievalFailure('An exact reviewed Production recovery object key is required.');
  }

  return key;
}

function parseExpectedBytes(value: string | undefined): number {
  const bytes = Number(value?.trim() ?? '');

  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw retrievalFailure('An exact positive encrypted recovery byte count is required.');
  }

  return bytes;
}

function parseExpectedSha256(value: string | undefined): string {
  const sha256 = value?.trim() ?? '';

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw retrievalFailure('An exact lowercase encrypted recovery SHA-256 is required.');
  }

  return sha256;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });

  return hash.digest('hex');
}

export async function retrieveProductionRecoveryObject(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RetrievalDependencies = {},
): Promise<RetrievedProductionRecovery> {
  const objectKey = parseObjectKey(env.RECOVERY_OBJECT_KEY);
  const expectedBytes = parseExpectedBytes(env.RECOVERY_EXPECTED_CIPHERTEXT_BYTES);
  const expectedSha256 = parseExpectedSha256(env.RECOVERY_EXPECTED_CIPHERTEXT_SHA256);

  const store = dependencies.store ?? new R2RecoveryObjectStore(env);
  const createWorkspace = dependencies.createWorkspace ?? createRecoveryWorkDirectory;
  const cleanupWorkspace = dependencies.cleanupWorkspace ?? cleanupRecoveryWorkDirectory;

  const workspacePath = await createWorkspace();
  const bundlePath = resolve(workspacePath, CIPHERTEXT_FILENAME);

  try {
    let remote;

    try {
      remote = await store.head(objectKey);
    } catch {
      throw retrievalFailure('Production recovery object metadata verification failed.');
    }

    if (
      !remote ||
      remote.key !== objectKey ||
      remote.bytes !== expectedBytes ||
      remote.sha256 !== expectedSha256
    ) {
      throw retrievalFailure('Production recovery object metadata did not match the accepted identity.');
    }

    try {
      await store.download(objectKey, bundlePath);
    } catch {
      throw retrievalFailure('Production recovery ciphertext retrieval failed.');
    }

    let downloadedBytes: number;
    let downloadedSha256: string;

    try {
      downloadedBytes = (await stat(bundlePath)).size;
      downloadedSha256 = await sha256File(bundlePath);
    } catch {
      throw retrievalFailure('Downloaded Production recovery ciphertext could not be verified.');
    }

    if (
      downloadedBytes !== expectedBytes ||
      downloadedSha256 !== expectedSha256
    ) {
      throw retrievalFailure(
        'Downloaded Production recovery ciphertext failed independent size or SHA-256 verification.',
      );
    }

    return {
      workspacePath,
      bundlePath,
      objectKey,
      bytes: downloadedBytes,
      ciphertextSha256: downloadedSha256,
    };
  } catch (error) {
    try {
      await cleanupWorkspace(workspacePath);
    } catch (cleanupError) {
      throw preservePrimaryWithCleanupFailure(error, cleanupError);
    }

    throw error;
  }
}

export async function cleanupRetrievedProductionRecovery(
  artifact: Pick<RetrievedProductionRecovery, 'workspacePath' | 'bundlePath'>,
): Promise<void> {
  const workspacePath = assertRecoveryWorkDirectory(artifact.workspacePath);
  const expectedBundlePath = resolve(workspacePath, CIPHERTEXT_FILENAME);

  if (resolve(artifact.bundlePath) !== expectedBundlePath) {
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Refused cleanup for an invalid Production recovery ciphertext location.',
      { phase: 'cleanup', timeout: false },
    );
  }

  await cleanupRecoveryWorkDirectory(workspacePath);
}

async function main(): Promise<void> {
  const [action, workspaceInput] = process.argv.slice(2);

  if (!action || action === 'retrieve') {
    const result = await retrieveProductionRecoveryObject();

    process.stdout.write(
      `${JSON.stringify({
        event: 'production_recovery_retrieved',
        objectKey: result.objectKey,
        bytes: result.bytes,
        ciphertextSha256: result.ciphertextSha256,
        workspacePath: result.workspacePath,
        bundlePath: result.bundlePath,
      })}\n`,
    );

    return;
  }

  if (action === 'cleanup') {
    if (!workspaceInput) {
      throw new RecoveryError(
        'BACKUP_PLAINTEXT_CLEANUP_FAILED',
        'The generated Production recovery workspace path is required for cleanup.',
        { phase: 'cleanup', timeout: false },
      );
    }

    const workspacePath = assertRecoveryWorkDirectory(workspaceInput);

    await cleanupRetrievedProductionRecovery({
      workspacePath,
      bundlePath: resolve(workspacePath, CIPHERTEXT_FILENAME),
    });

    process.stdout.write(
      `${JSON.stringify({ event: 'production_recovery_retrieval_cleanup_complete' })}\n`,
    );

    return;
  }

  throw retrievalFailure('Unknown Production recovery retrieval action.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
    process.exitCode = 1;
  });
}
