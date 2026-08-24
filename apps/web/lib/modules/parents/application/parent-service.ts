import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type {
  PageInput, PageResult, ParentCreate, ParentPatch, RelationshipCreate,
} from '../domain/contracts';
import { assertParentStatusTransition } from '../domain/lifecycle';
import * as repo from '../infrastructure/repositories/parent-repository';
import type {
  ParentFilters, ParentsDb, RelationshipFilters,
} from '../infrastructure/repositories/parent-repository';
import { isUniqueViolation, ParentDomainError } from './parent-errors';

export interface Actor { userId: string | null; schoolId: string }

function paging(input: PageInput) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function page<T>(rows: T[], total: number, input: PageInput): PageResult<T> {
  return { data: rows, meta: { page: input.page, pageSize: input.pageSize, total } };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function parentNotFound(): never {
  throw new ParentDomainError('PARENT_NOT_FOUND', 'Parent was not found.');
}
function relationshipNotFound(): never {
  throw new ParentDomainError(
    'PARENT_RELATIONSHIP_NOT_FOUND',
    'Parent-Student relationship was not found.',
  );
}

async function authorize(
  db: ParentsDb,
  actor: Actor,
  permission: 'parents.read' | 'parents.manage',
) {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission,
    scope: { kind: 'school' },
  });
  const context = await resolveCurrentContext(db as unknown as AuthorizationDb, actor);
  return context.role as Role;
}
async function read(db: ParentsDb, actor: Actor) {
  return authorize(db, actor, 'parents.read');
}
async function manage(db: ParentsDb, actor: Actor) {
  await authorize(db, actor, 'parents.manage');
}

async function assertParentReadable(
  db: ParentsDb,
  actor: Actor,
  parentId: string,
  role?: Role,
) {
  const resolvedRole = role ?? await read(db, actor);
  const parent = await repo.findParent(db, actor.schoolId, parentId);
  if (!parent) parentNotFound();
  if (resolvedRole === 'SCHOOL_ADMIN' || resolvedRole === 'SUPER_ADMIN') return parent;
  if (resolvedRole === 'PARENT' && actor.userId && parent.userId === actor.userId) return parent;
  parentNotFound();
}

async function assertValidUserLink(db: ParentsDb, actor: Actor, userId: string) {
  const [user, membership] = await Promise.all([
    repo.findUser(db, userId),
    repo.findMembership(db, actor.schoolId, userId),
  ]);
  if (!user || user.status !== 'ACTIVE' || !membership || membership.status !== 'ACTIVE') {
    throw new ParentDomainError(
      'INVALID_USER_LINK',
      'Parent userId must identify an ACTIVE User with an ACTIVE membership in this School.',
    );
  }
}

export async function listParents(
  db: ParentsDb,
  actor: Actor,
  input: PageInput & ParentFilters,
) {
  const role = await read(db, actor);
  if (role !== 'SCHOOL_ADMIN' && role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only School administrators may access the Parent list.');
  }
  const result = await repo.listParents(db, actor.schoolId, paging(input), input);
  return page(result.rows.map(view), result.total, input);
}

export async function getParent(db: ParentsDb, actor: Actor, id: string) {
  return view(await assertParentReadable(db, actor, id));
}

export interface ParentBootstrapProfile {
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    status: 'ACTIVE';
  };
  children: Array<{
    relationshipId: string;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      studentCode: string | null;
    };
  }>;
}

/**
 * Self-scoped current Parent portal bootstrap. Permission/context checks run
 * before the repository query; identity and School always come from the actor
 * derived by requireCurrentContext at the HTTP boundary.
 */
export async function listSelfParentProfiles(
  db: ParentsDb,
  actor: Actor,
): Promise<{ data: ParentBootstrapProfile[] }> {
  await read(db, actor);
  const rows = await repo.listSelfParentProfiles(db, actor.schoolId, actor.userId!);
  const profiles = new Map<string, ParentBootstrapProfile>();
  for (const row of rows) {
    let profile = profiles.get(row.parentId);
    if (!profile) {
      profile = {
        parent: {
          id: row.parentId,
          firstName: row.parentFirstName,
          lastName: row.parentLastName,
          status: 'ACTIVE',
        },
        children: [],
      };
      profiles.set(row.parentId, profile);
    }
    if (
      row.relationshipId !== null
      && row.studentId !== null
      && row.studentFirstName !== null
      && row.studentLastName !== null
    ) {
      profile.children.push({
        relationshipId: row.relationshipId,
        student: {
          id: row.studentId,
          firstName: row.studentFirstName,
          lastName: row.studentLastName,
          studentCode: row.studentCode,
        },
      });
    }
  }
  return { data: [...profiles.values()] };
}

export async function createParent(db: ParentsDb, actor: Actor, input: ParentCreate) {
  await manage(db, actor);
  if (input.userId) await assertValidUserLink(db, actor, input.userId);
  try {
    return view(await repo.insertParent(db, actor.schoolId, input));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ParentDomainError(
        'DUPLICATE_PARENT_CODE',
        'The Parent code is already in use in this School.',
      );
    }
    throw error;
  }
}

export async function patchParent(
  db: ParentsDb,
  actor: Actor,
  id: string,
  input: ParentPatch,
) {
  const role = await read(db, actor);
  const current = await assertParentReadable(db, actor, id, role);
  if (role === 'PARENT') {
    const administrative = input.parentCode !== undefined
      || input.userId !== undefined
      || input.status !== undefined;
    if (administrative) {
      throw new ForbiddenError('Parents may update only their own first and last name.');
    }
  } else {
    await manage(db, actor);
  }
  if (input.status) assertParentStatusTransition(current.status, input.status);
  if (input.userId) await assertValidUserLink(db, actor, input.userId);
  try {
    return view((await repo.updateParent(db, actor.schoolId, id, input)) ?? parentNotFound());
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ParentDomainError(
        'DUPLICATE_PARENT_CODE',
        'The Parent code is already in use in this School.',
      );
    }
    throw error;
  }
}

export async function createRelationship(
  db: ParentsDb,
  actor: Actor,
  parentId: string,
  input: RelationshipCreate,
) {
  await manage(db, actor);
  const [parent, student] = await Promise.all([
    repo.findParent(db, actor.schoolId, parentId),
    repo.findStudent(db, actor.schoolId, input.studentId),
  ]);
  if (!parent) parentNotFound();
  if (parent.status !== 'ACTIVE') {
    throw new ParentDomainError(
      'PARENT_NOT_ACTIVE',
      'Only an ACTIVE Parent may receive a current Student relationship.',
    );
  }
  if (!student) {
    throw new ParentDomainError(
      'INVALID_RELATIONSHIP_CONTEXT',
      'Student is not available in the current School.',
    );
  }
  if (student.status === 'WITHDRAWN' || student.status === 'ARCHIVED') {
    throw new ParentDomainError(
      'INVALID_RELATIONSHIP_CONTEXT',
      'A current relationship cannot be created for a WITHDRAWN or ARCHIVED Student.',
    );
  }
  if (await repo.findActiveRelationship(db, actor.schoolId, parentId, input.studentId)) {
    throw new ParentDomainError(
      'DUPLICATE_PARENT_STUDENT_RELATIONSHIP',
      'This Parent and Student already have an ACTIVE relationship.',
    );
  }
  try {
    return view(await repo.insertRelationship(db, {
      schoolId: actor.schoolId,
      parentId,
      studentId: input.studentId,
      status: 'ACTIVE',
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ParentDomainError(
        'DUPLICATE_PARENT_STUDENT_RELATIONSHIP',
        'A concurrent request already created this ACTIVE relationship.',
      );
    }
    throw error;
  }
}

export async function listRelationshipHistory(
  db: ParentsDb,
  actor: Actor,
  parentId: string,
  input: PageInput & RelationshipFilters,
) {
  const role = await read(db, actor);
  await assertParentReadable(db, actor, parentId, role);
  if (role === 'PARENT' && input.status === 'ENDED') {
    throw new ForbiddenError('Parents may access only their current Student relationships.');
  }
  const filters = role === 'PARENT' ? { ...input, status: 'ACTIVE' as const } : input;
  const result = await repo.listRelationships(
    db,
    actor.schoolId,
    parentId,
    paging(input),
    filters,
  );
  return page(result.rows.map(view), result.total, input);
}

export async function endRelationship(db: ParentsDb, actor: Actor, relationshipId: string) {
  await manage(db, actor);
  const current = await repo.findRelationship(db, actor.schoolId, relationshipId);
  if (!current) relationshipNotFound();
  if (current.status === 'ENDED') return view(current);
  const ended = await repo.endRelationshipIfActive(db, actor.schoolId, relationshipId);
  if (ended) return view(ended);
  const raced = await repo.findRelationship(db, actor.schoolId, relationshipId);
  if (raced?.status === 'ENDED') return view(raced);
  relationshipNotFound();
}
