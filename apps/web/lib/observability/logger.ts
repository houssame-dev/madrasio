import { AppError } from '@/lib/errors';

export type LogLevel = 'info' | 'warn' | 'error';

export type OperationalErrorCategory =
  | 'authentication_failure'
  | 'authorization_denial'
  | 'validation_failure'
  | 'database_unavailable'
  | 'provider_failure'
  | 'background_job_failure'
  | 'unexpected_internal_error';

type LogValue = unknown;
type LogMetadata = Record<string, LogValue>;

const MAX_DEPTH = 3;
const MAX_ENTRIES = 24;
const MAX_STRING_LENGTH = 256;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|credential|api[-_]?key|session|email|phone|body|content|database[-_]?url|connection[-_]?string|certificate|(^|_)ca($|_)/i;
const DATABASE_ERROR_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '57P01',
  '57P02',
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function boundedString(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return boundedString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: boundedString(value.name) };
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ENTRIES).map((item) => sanitizeValue(key, item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_ENTRIES)
        .map(([childKey, childValue]) => [
          childKey,
          sanitizeValue(childKey, childValue, depth + 1),
        ]),
    );
  }
  return String(value);
}

/** Redacts secret/PII-shaped fields and bounds nested metadata before logging. */
export function sanitizeLogMetadata(metadata: LogMetadata = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, MAX_ENTRIES)
      .map(([key, value]) => [key, sanitizeValue(key, value, 0)]),
  );
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  metadata: LogMetadata = {},
): void {
  const entry = JSON.stringify({
    ...sanitizeLogMetadata(metadata),
    timestamp: new Date().toISOString(),
    level,
    event: boundedString(event),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : undefined;
}

export function classifyOperationalError(
  error: unknown,
  fallback: OperationalErrorCategory = 'unexpected_internal_error',
): OperationalErrorCategory {
  if (fallback === 'background_job_failure') return fallback;
  if (error instanceof AppError) {
    if (error.code === 'UNAUTHENTICATED') return 'authentication_failure';
    if (error.code === 'FORBIDDEN') return 'authorization_denial';
    if (error.code === 'VALIDATION_ERROR') return 'validation_failure';
    const featureCode = 'featureCode' in error
      ? String((error as AppError & { featureCode?: unknown }).featureCode ?? '')
      : '';
    if (/INVITE|AUTH_PROVIDER|SMTP|PROVIDER/.test(featureCode)) return 'provider_failure';
  }
  const code = errorCode(error);
  if (code && DATABASE_ERROR_CODES.has(code)) return 'database_unavailable';
  return fallback;
}
