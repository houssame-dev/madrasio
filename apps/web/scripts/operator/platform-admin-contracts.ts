import { z } from 'zod';
import { X509Certificate, createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { normalizeEmail } from '@/lib/auth/email';
import { STAGING_PROJECT_REF } from '../deployment/contracts';

export const ADMIN_ACTION = 'PlatformAdminDesignated';
export const ADMIN_ACTOR = 'STAGING_PLATFORM_ADMIN_OPERATOR';
export const ADMIN_ORIGIN = 'https://madrasio-staging.vercel.app';
export const modeSchema = z.enum(['preflight', 'prepare-invite', 'invite', 'designate', 'verify']);
export type AdminMode = z.infer<typeof modeSchema>;
export class PlatformOperatorError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function refuse(code: string): never { throw new PlatformOperatorError(code); }

const preflightSchema = z.object({
  PLATFORM_ADMIN_TARGET_ENV: z.literal('staging'),
  STAGING_EXPECTED_PROJECT_REF: z.literal(STAGING_PROJECT_REF),
  // Not used by general preflight, but reject a conflicting supplied Auth target.
  SUPABASE_URL: z.literal(`https://${STAGING_PROJECT_REF}.supabase.co`).optional(),
  MIGRATION_DATABASE_URL: z.string().url(),
  DATABASE_SSL_CA: z.string().min(1),
});
const inputSchema = preflightSchema.extend({
  SUPABASE_URL: z.literal(`https://${STAGING_PROJECT_REF}.supabase.co`),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.literal(ADMIN_ORIGIN),
  PLATFORM_ADMIN_EMAIL: z.string().trim().email().transform(normalizeEmail),
  PLATFORM_ADMIN_AUTH_USER_ID: z.string().uuid().optional(),
  PLATFORM_ADMIN_OPERATION_ID: z.string().uuid(),
  PLATFORM_ADMIN_AUTHORIZATION_ID: z.string().uuid(),
  PLATFORM_ADMIN_RECEIPT_PATH: z.string().refine(isAbsolute),
  PLATFORM_ADMIN_CONFIRMATION: z.string().optional(),
});
export type PlatformAdminConfig = z.infer<typeof inputSchema>;
export type PlatformPreflightConfig = z.infer<typeof preflightSchema>;

/** Environment-only inputs. No dotenv loader, password, claims or account data in argv. */
export function parsePlatformAdminConfig(env: NodeJS.ProcessEnv, mode: 'preflight'): PlatformPreflightConfig;
export function parsePlatformAdminConfig(env: NodeJS.ProcessEnv, mode: Exclude<AdminMode, 'preflight'>): PlatformAdminConfig;
export function parsePlatformAdminConfig(env: NodeJS.ProcessEnv, mode: AdminMode): PlatformAdminConfig | PlatformPreflightConfig {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
      Object.entries(env).some(([key, value]) => key.startsWith('NEXT_PUBLIC_') && /SECRET|SERVICE_ROLE|PASSWORD|TOKEN/.test(key) && value)) {
    refuse('UNSAFE_OPERATOR_ENVIRONMENT');
  }
  const parsed = preflightSchema.safeParse(env);
  if (!parsed.success) refuse('INVALID_OPERATOR_CONFIGURATION');
  const config = parsed.data;
  try {
    const url = new URL(config.MIGRATION_DATABASE_URL);
    if (url.protocol !== 'postgresql:' || url.port !== '5432' || url.pathname !== '/postgres' ||
        !/^aws-\d+-eu-central-1\.pooler\.supabase\.com$/.test(url.hostname) ||
        decodeURIComponent(url.username) !== `postgres.${STAGING_PROJECT_REF}` || !url.password || url.search || url.hash) {
      refuse('STAGING_DATABASE_TARGET_REJECTED');
    }
    const ca = config.DATABASE_SSL_CA.replace(/\\n/g, '\n');
    if (!ca.includes('-----BEGIN CERTIFICATE-----')) refuse('TRUSTED_CA_REQUIRED');
    new X509Certificate(ca);
  } catch { refuse('STAGING_DATABASE_OR_TLS_REJECTED'); }
  if (mode === 'preflight') return config;
  // Parse the full operation contract before permitting identity or mutation work.
  const identity = inputSchema.safeParse(env);
  if (!identity.success) refuse('INVALID_OPERATOR_CONFIGURATION');
  if ((mode === 'designate' || mode === 'verify') && !identity.data.PLATFORM_ADMIN_AUTH_USER_ID) refuse('EXACT_AUTH_UUID_REQUIRED');
  if (mode === 'invite' && identity.data.PLATFORM_ADMIN_CONFIRMATION !== 'INVITE_STAGING_PLATFORM_ADMIN') refuse('INVITATION_AUTHORIZATION_REQUIRED');
  if (mode === 'designate' && identity.data.PLATFORM_ADMIN_CONFIRMATION !== 'DESIGNATE_STAGING_PLATFORM_ADMIN') refuse('DESIGNATION_AUTHORIZATION_REQUIRED');
  return identity.data;
}

export const receiptSchema = z.object({
  version: z.literal(1),
  projectRef: z.literal(STAGING_PROJECT_REF),
  operationId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  recipientDigest: z.string().regex(/^[a-f0-9]{64}$/),
  notBefore: z.string().datetime(),
  stage: z.enum(['prepared', 'invitation-attempted', 'invited', 'designation-attempted', 'complete']),
  authUserId: z.string().uuid().optional(),
}).strict();
export type AdminReceipt = z.infer<typeof receiptSchema>;
export interface ReceiptStore {
  read(): Promise<AdminReceipt>;
  create(receipt: AdminReceipt): Promise<void>;
  replace(receipt: AdminReceipt): Promise<void>;
}
export function recipientDigest(config: PlatformAdminConfig) {
  return createHash('sha256').update(`${config.PLATFORM_ADMIN_OPERATION_ID}\0${config.PLATFORM_ADMIN_EMAIL}`).digest('hex');
}
export function checkReceipt(config: PlatformAdminConfig, receipt: AdminReceipt) {
  if (receipt.operationId !== config.PLATFORM_ADMIN_OPERATION_ID ||
      receipt.authorizationId !== config.PLATFORM_ADMIN_AUTHORIZATION_ID ||
      receipt.recipientDigest !== recipientDigest(config) ||
      receipt.projectRef !== STAGING_PROJECT_REF ||
      (config.PLATFORM_ADMIN_AUTH_USER_ID && receipt.authUserId !== config.PLATFORM_ADMIN_AUTH_USER_ID)) {
    refuse('RECEIPT_IDENTITY_MISMATCH');
  }
}
