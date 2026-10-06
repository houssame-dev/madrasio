import 'server-only';
import { AppError, ValidationError } from '@/lib/errors';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { auditPageSchema, schoolAuditEventSchema, type SchoolAuditEvent } from './contracts';
import * as repository from './repository';
import type { AuditDb, AuditTransaction } from './repository';

export class AuditPersistenceError extends AppError {
  readonly featureCode = 'AUDIT_PERSISTENCE_FAILED';
  constructor() {
    super('INTERNAL_ERROR', 'The action could not be recorded. No business change was committed.');
  }
}

/** Server-only module boundary: actor is supplied by a business service from its session/context. */
export async function recordSchoolAudit(
  tx: AuditTransaction,
  actor: { userId: string | null; schoolId: string },
  event: SchoolAuditEvent,
) {
  const parsed = schoolAuditEventSchema.safeParse(event);
  if (!parsed.success) throw new ValidationError('Invalid audit action context.');
  // Current inventory is academic administration only. Future actions must add their own permission mapping.
  await requireOperation(tx as unknown as AuthorizationDb, actor, {
    permission: 'academic_structure.manage',
    scope: { kind: 'school' },
  });
  const value = parsed.data;
  try {
    await repository.appendAuditEvent(tx, {
      scope: 'SCHOOL',
      schoolId: actor.schoolId,
      actorKind: 'USER',
      actorUserId: actor.userId!,
      action: value.action,
      resourceId: value.resourceId,
      resourceType: value.action === 'ClassCurriculumChanged' ? 'Class' : 'CurriculumVersion',
      metadata: value.metadata,
    });
  } catch {
    // Never preserve raw SQL, payload or database cause in the public/logged error.
    throw new AuditPersistenceError();
  }
}

export async function readSchoolAudit(
  db: AuditDb,
  actor: { userId: string | null; schoolId: string },
  input: { page: number; pageSize: number },
) {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'audit.read',
    scope: { kind: 'school' },
  });
  const parsed = auditPageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid audit pagination.');
  return repository.listSchoolAuditEvents(
    db,
    actor.schoolId,
    parsed.data.page,
    parsed.data.pageSize,
  );
}
