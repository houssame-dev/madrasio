import { z } from 'zod';

import { normalizeEmail } from '@/lib/auth/email';
import { assertPublicSupabaseKey } from '@/lib/config/supabase-keys';

export const STAGING_PROJECT_REF = 'cqeaxlttezunirsmkrxz';

export class OperatorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperatorError';
  }
}

const required = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .trim()
    .min(1);
const password = (name: string) =>
  required(name).min(12, `${name} must contain at least 12 characters`);

const commonSchema = z.object({
  BOOTSTRAP_TARGET_ENV: z.enum(['staging', 'production']),
  BOOTSTRAP_EXPECTED_PROJECT_REF: required('BOOTSTRAP_EXPECTED_PROJECT_REF'),
  SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SECRET_KEY: required('SUPABASE_SECRET_KEY'),
  DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email(),
  BOOTSTRAP_ADMIN_PASSWORD: password('BOOTSTRAP_ADMIN_PASSWORD'),
  BOOTSTRAP_SCHOOL_NAME: required('BOOTSTRAP_SCHOOL_NAME'),
  BOOTSTRAP_SCHOOL_TIMEZONE: required('BOOTSTRAP_SCHOOL_TIMEZONE').default('Africa/Casablanca'),
});

const seedSchema = commonSchema
  .extend({
    STAGING_TEACHER_EMAIL: z.string().trim().email(),
    STAGING_TEACHER_PASSWORD: password('STAGING_TEACHER_PASSWORD'),
    STAGING_PARENT_EMAIL: z.string().trim().email(),
    STAGING_PARENT_PASSWORD: password('STAGING_PARENT_PASSWORD'),
  })
  .superRefine((value, context) => {
    const emails = [
      value.BOOTSTRAP_ADMIN_EMAIL,
      value.STAGING_TEACHER_EMAIL,
      value.STAGING_PARENT_EMAIL,
    ].map(normalizeEmail);
    if (new Set(emails).size !== emails.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STAGING_TEACHER_EMAIL'],
        message: 'Admin, Teacher, and Parent fixture emails must be distinct.',
      });
    }
  });

export type BootstrapConfig = z.infer<typeof commonSchema>;
export type SeedConfig = z.infer<typeof seedSchema>;

function projectRefFromAuthUrl(value: string): string | null {
  const match = new URL(value).hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  return match?.[1] ?? null;
}

function dbTargetsProject(value: string, expectedRef: string): boolean {
  const url = new URL(value);
  return (
    url.hostname.includes(expectedRef) || decodeURIComponent(url.username).includes(expectedRef)
  );
}

function assertNoBrowserOperatorSecret(env: NodeJS.ProcessEnv): void {
  const exposed = Boolean(env.NEXT_PUBLIC_SUPABASE_SECRET_KEY?.trim());
  if (exposed) {
    throw new OperatorError(
      'BROWSER_OPERATOR_SECRET_REJECTED',
      'An operator credential must never use a NEXT_PUBLIC_ variable.',
    );
  }
}

function validateTarget(config: BootstrapConfig, mode: 'bootstrap' | 'seed'): void {
  if (mode === 'seed' && config.BOOTSTRAP_TARGET_ENV !== 'staging') {
    throw new OperatorError('PRODUCTION_SEED_REFUSED', 'Demo seed supports STAGING only.');
  }
  if (config.BOOTSTRAP_TARGET_ENV !== 'staging') {
    throw new OperatorError(
      'PRODUCTION_CONFIRMATION_REQUIRED',
      'Production bootstrap requires a separately designed stronger confirmation flow.',
    );
  }
  if (config.BOOTSTRAP_EXPECTED_PROJECT_REF !== STAGING_PROJECT_REF) {
    throw new OperatorError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'The expected project ref is not the approved STAGING project.',
    );
  }
  if (projectRefFromAuthUrl(config.SUPABASE_URL) !== STAGING_PROJECT_REF) {
    throw new OperatorError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'The Supabase Auth URL does not identify the approved STAGING project.',
    );
  }
  const runtime = new URL(config.DATABASE_URL);
  const migration = new URL(config.MIGRATION_DATABASE_URL);
  if (!dbTargetsProject(config.DATABASE_URL, STAGING_PROJECT_REF) || runtime.port !== '6543') {
    throw new OperatorError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'DATABASE_URL must be the approved STAGING Transaction Pooler on port 6543.',
    );
  }
  if (
    !dbTargetsProject(config.MIGRATION_DATABASE_URL, STAGING_PROJECT_REF) ||
    migration.port !== '5432'
  ) {
    throw new OperatorError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'MIGRATION_DATABASE_URL must be the approved STAGING Session Pooler on port 5432.',
    );
  }
}

function parse<T extends z.ZodTypeAny>(
  schema: T,
  env: NodeJS.ProcessEnv,
  mode: 'bootstrap' | 'seed',
): z.output<T> {
  assertNoBrowserOperatorSecret(env);
  assertPublicSupabaseKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
  const result = schema.safeParse(env);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new OperatorError('INVALID_OPERATOR_INPUT', `Invalid operator configuration: ${keys}`);
  }
  validateTarget(result.data as BootstrapConfig, mode);
  try {
    new Intl.DateTimeFormat('en', { timeZone: result.data.BOOTSTRAP_SCHOOL_TIMEZONE });
  } catch {
    throw new OperatorError(
      'INVALID_OPERATOR_INPUT',
      'Invalid operator configuration: BOOTSTRAP_SCHOOL_TIMEZONE',
    );
  }
  return result.data;
}

export function parseBootstrapConfig(env: NodeJS.ProcessEnv): BootstrapConfig {
  return parse(commonSchema, env, 'bootstrap');
}

export function parseSeedConfig(env: NodeJS.ProcessEnv): SeedConfig {
  return parse(seedSchema, env, 'seed');
}

export interface SafeLogger {
  info(event: string, details?: Record<string, string | number | boolean>): void;
  error(event: string, details?: Record<string, string | number | boolean>): void;
}

export const consoleLogger: SafeLogger = {
  info(event, details) {
    console.info(JSON.stringify({ level: 'info', event, ...details }));
  },
  error(event, details) {
    console.error(JSON.stringify({ level: 'error', event, ...details }));
  },
};

export type AuthIdentity = { id: string; email: string };

export interface AuthAdminPort {
  listUsers(): Promise<AuthIdentity[]>;
  createUser(input: { email: string; password: string }): Promise<AuthIdentity>;
  deleteUser(id: string): Promise<void>;
}

export type BootstrapDbState =
  { kind: 'empty' } | { kind: 'complete'; schoolId: string } | { kind: 'partial'; reason: string };

export interface BootstrapStorePort {
  inspect(
    authUser: AuthIdentity | null,
    input: { schoolName: string; timezone: string },
  ): Promise<BootstrapDbState>;
  create(input: {
    authUserId: string;
    authUserEmail: string;
    schoolName: string;
    timezone: string;
  }): Promise<{ schoolId: string }>;
}

export type SeedDbState =
  | { kind: 'empty'; schoolId: string }
  | { kind: 'complete'; schoolId: string }
  | { kind: 'reconcilable'; schoolId: string }
  | { kind: 'partial'; reason: string };

export interface DemoSeedStorePort {
  inspect(input: {
    adminUser: AuthIdentity | null;
    teacherUser: AuthIdentity | null;
    parentUser: AuthIdentity | null;
    schoolName: string;
  }): Promise<SeedDbState>;
  create(input: {
    schoolId: string;
    teacherUser: AuthIdentity;
    parentUser: AuthIdentity;
  }): Promise<void>;
  reconcileGradingFixture(schoolId: string): Promise<void>;
}
