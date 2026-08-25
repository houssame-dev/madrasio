import { ForbiddenError } from '@/lib/errors';

import type {
  AnnouncementCreateInput, AnnouncementListInput, AnnouncementPatchInput,
  AnnouncementTargetsCreateInput, AnnouncementVersionCreateInput, PageInput,
} from '../domain/contracts';
import * as repo from '../infrastructure/repositories/announcement-repository';
import type {
  AnnouncementRow, AnnouncementTargetRow, AnnouncementsDb,
} from '../infrastructure/repositories/announcement-repository';
import { AnnouncementDomainError } from './announcement-errors';
import {
  requireAnnouncementOperation, type AnnouncementPublishAuthorization,
} from './authorization';

export interface AnnouncementActor { userId: string | null; schoolId: string }

function paging(input: PageInput) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function notFound(): never {
  throw new AnnouncementDomainError('ANNOUNCEMENT_NOT_FOUND', 'Announcement was not found.');
}
function versionNotFound(): never {
  throw new AnnouncementDomainError('VERSION_NOT_FOUND', 'Announcement Version was not found.');
}
function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: string; cause?: { code?: string } } | null;
  return value?.code === '23505' || value?.cause?.code === '23505';
}

function teacherCoversTargets(
  auth: AnnouncementPublishAuthorization,
  targets: AnnouncementTargetRow[],
) {
  return targets.every((target) => target.targetType === 'CLASS' && target.classId !== null
    && auth.teacherAssignments.some((assignment) => assignment.status === 'ACTIVE'
      && assignment.classId === target.classId
      && assignment.academicYearId === target.academicYearId));
}

async function requireManagement(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  announcement: AnnouncementRow,
  permission: 'announcements.read' | 'announcements.create' = 'announcements.create',
  versionId?: string,
) {
  const auth = await requireAnnouncementOperation(db, actor, permission);
  if (auth.role === 'PARENT') throw new ForbiddenError('Parents cannot access Announcement management APIs.');
  if (auth.role !== 'TEACHER') return auth;
  if (!actor.userId || announcement.createdBy !== actor.userId) {
    throw new ForbiddenError('Teachers may manage only Announcements they authored.');
  }
  const version = versionId
    ? await repo.findVersionForAnnouncement(db, actor.schoolId, announcement.id, versionId)
    : await repo.findLatestVersion(db, actor.schoolId, announcement.id);
  if (!version) versionNotFound();
  const targets = await repo.findTargets(db, actor.schoolId, version.id);
  if (!auth.teacherAssignments.some((assignment) => assignment.status === 'ACTIVE')
    || !teacherCoversTargets(auth, targets)) {
    throw new ForbiddenError('Announcement is outside the Teacher assignment scope.');
  }
  return auth;
}

async function announcement(db: AnnouncementsDb, actor: AnnouncementActor, id: string) {
  const row = await repo.findAnnouncement(db, actor.schoolId, id);
  if (!row) notFound();
  return row;
}

export async function createAnnouncement(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  input: AnnouncementCreateInput,
) {
  const auth = await requireAnnouncementOperation(db, actor, 'announcements.create');
  if (auth.role === 'PARENT') throw new ForbiddenError('Parents cannot create Announcements.');
  if (auth.role === 'TEACHER' && !auth.teacherAssignments.some((item) => item.status === 'ACTIVE')) {
    throw new ForbiddenError('Announcement creation requires an active TeacherAssignment.');
  }
  if (!actor.userId) throw new ForbiddenError('Announcement authorship requires an authenticated User.');
  return db.transaction(async (tx) => {
    const created = await repo.insertAnnouncement(tx, {
      schoolId: actor.schoolId, status: 'DRAFT', createdBy: actor.userId!,
    });
    const version = await repo.insertVersion(tx, {
      schoolId: actor.schoolId,
      announcementId: created.id,
      versionNumber: 1,
      title: input.title,
      body: input.body,
      createdBy: actor.userId!,
    });
    return { announcement: view(created), version: view(version) };
  });
}

export async function listAnnouncements(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  input: AnnouncementListInput,
) {
  const auth = await requireAnnouncementOperation(db, actor, 'announcements.read');
  if (auth.role === 'PARENT') throw new ForbiddenError('Parents cannot access Announcement management APIs.');
  const result = await repo.listAnnouncements(
    db, actor.schoolId, paging(input), input,
    auth.role === 'TEACHER' ? actor.userId ?? undefined : undefined,
  );
  const latestVersions = await repo.findLatestVersions(
    db, actor.schoolId, result.rows.map((row) => row.id),
  );
  const latestByAnnouncement = new Map(
    latestVersions.map((version) => [version.announcementId, version]),
  );
  const data = result.rows.map((row) => {
    const latestVersion = latestByAnnouncement.get(row.id);
    return { ...view(row), latestVersion: latestVersion ? view(latestVersion) : null };
  });
  return { data, meta: { page: input.page, pageSize: input.pageSize, total: result.total } };
}

export async function getAnnouncement(db: AnnouncementsDb, actor: AnnouncementActor, id: string) {
  const row = await announcement(db, actor, id);
  await requireManagement(db, actor, row, 'announcements.read');
  const latestVersion = await repo.findLatestVersion(db, actor.schoolId, row.id);
  if (!latestVersion) versionNotFound();
  const [targets, publicationCount, latestPublication] = await Promise.all([
    repo.findTargets(db, actor.schoolId, latestVersion.id),
    repo.countPublications(db, actor.schoolId, row.id),
    repo.findLatestPublication(db, actor.schoolId, row.id),
  ]);
  return {
    announcement: view(row),
    latestVersion: view(latestVersion),
    targetSummary: {
      count: targets.length,
      audiences: [...new Set(targets.map((target) => target.audience))].sort(),
      targetTypes: [...new Set(targets.map((target) => target.targetType))].sort(),
    },
    publicationSummary: {
      count: publicationCount,
      latest: latestPublication ? {
        id: latestPublication.id,
        announcementVersionId: latestPublication.announcementVersionId,
        publicationVersion: latestPublication.publicationVersion,
        status: latestPublication.status,
        scheduledAt: latestPublication.scheduledAt,
        publishedAt: latestPublication.publishedAt,
      } : null,
    },
  };
}

export async function patchAnnouncement(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  input: AnnouncementPatchInput,
) {
  const row = await announcement(db, actor, id);
  await requireManagement(db, actor, row);
  if (input.status !== 'ARCHIVED') {
    throw new AnnouncementDomainError(
      'INVALID_ANNOUNCEMENT_STATUS_TRANSITION',
      `Announcement cannot transition from ${row.status} to ${input.status}.`,
    );
  }
  if (row.status === 'ARCHIVED') return view(row);
  if (await repo.hasScheduledPublication(db, actor.schoolId, row.id)) {
    throw new AnnouncementDomainError(
      'ANNOUNCEMENT_NOT_EDITABLE',
      'An Announcement with a scheduled publication cannot be archived because cancellation is not modeled.',
    );
  }
  await repo.updateAnnouncementStatus(db, actor.schoolId, row.id, 'ARCHIVED');
  return view((await repo.findAnnouncement(db, actor.schoolId, row.id))!);
}

export async function createAnnouncementVersion(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  input: AnnouncementVersionCreateInput,
) {
  const row = await announcement(db, actor, id);
  await requireManagement(db, actor, row);
  if (row.status === 'ARCHIVED') {
    throw new AnnouncementDomainError('ANNOUNCEMENT_NOT_EDITABLE', 'Archived Announcements are immutable.');
  }
  if (!actor.userId) throw new ForbiddenError('Version authorship requires an authenticated User.');
  try {
    return await db.transaction(async (tx) => {
      const latest = await repo.findLatestVersion(tx, actor.schoolId, row.id);
      if (!latest) versionNotFound();
      const version = await repo.insertVersion(tx, {
        schoolId: actor.schoolId,
        announcementId: row.id,
        versionNumber: latest.versionNumber + 1,
        title: input.title,
        body: input.body,
        createdBy: actor.userId!,
      });
      return view(version);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AnnouncementDomainError(
        'ANNOUNCEMENT_VERSION_CONFLICT',
        'A concurrent Announcement Version was created. Retry with the latest version history.',
      );
    }
    throw error;
  }
}

export async function listAnnouncementVersions(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  input: PageInput,
) {
  const row = await announcement(db, actor, id);
  await requireManagement(db, actor, row, 'announcements.read');
  const result = await repo.listVersions(db, actor.schoolId, row.id, paging(input));
  return {
    data: result.rows.map(view),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

export async function listAnnouncementTargets(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  announcementVersionId?: string,
) {
  const row = await announcement(db, actor, id);
  const version = announcementVersionId
    ? await repo.findVersionForAnnouncement(db, actor.schoolId, row.id, announcementVersionId)
    : await repo.findLatestVersion(db, actor.schoolId, row.id);
  if (!version) versionNotFound();
  await requireManagement(db, actor, row, 'announcements.read', version.id);
  return (await repo.findTargets(db, actor.schoolId, version.id)).map(view);
}

export async function addAnnouncementTargets(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  input: AnnouncementTargetsCreateInput,
) {
  const row = await announcement(db, actor, id);
  const version = await repo.findVersionForAnnouncement(
    db, actor.schoolId, row.id, input.announcementVersionId,
  );
  if (!version) versionNotFound();
  const auth = await requireManagement(db, actor, row, 'announcements.create', version.id);
  if (row.status === 'ARCHIVED') {
    throw new AnnouncementDomainError('ANNOUNCEMENT_NOT_EDITABLE', 'Archived Announcements are immutable.');
  }
  const latest = await repo.findLatestVersion(db, actor.schoolId, row.id);
  if (!latest || latest.id !== version.id || await repo.versionHasPublication(db, actor.schoolId, version.id)) {
    throw new AnnouncementDomainError(
      'ANNOUNCEMENT_VERSION_IMMUTABLE',
      'Only the latest never-scheduled, never-published Version may receive targets.',
    );
  }
  const yearIds = [...new Set(input.targets.map((target) => target.academicYearId))];
  const classIds = input.targets.flatMap((target) => target.classId ? [target.classId] : []);
  const [years, classes] = await Promise.all([
    repo.findAcademicYears(db, actor.schoolId, yearIds),
    repo.findClasses(db, actor.schoolId, classIds),
  ]);
  const yearsById = new Map(years.map((year) => [year.id, year]));
  const classesById = new Map(classes.map((item) => [item.id, item]));
  if (yearIds.some((yearId) => yearsById.get(yearId)?.status !== 'ACTIVE')) {
    throw new AnnouncementDomainError('INVALID_ANNOUNCEMENT_CONTEXT', 'Targets require an ACTIVE AcademicYear.');
  }
  for (const target of input.targets) {
    if (target.targetType === 'CLASS') {
      const classRow = target.classId ? classesById.get(target.classId) : undefined;
      if (!classRow || classRow.status !== 'ACTIVE' || classRow.academicYearId !== target.academicYearId) {
        throw new AnnouncementDomainError(
          'INVALID_ANNOUNCEMENT_CONTEXT',
          'CLASS targets require an ACTIVE same-School Class in the specified AcademicYear.',
        );
      }
    }
  }
  if (auth.role === 'TEACHER') {
    const proposed = input.targets.map((target) => ({
      id: '', schoolId: actor.schoolId, announcementVersionId: version.id,
      audience: target.audience, targetType: target.targetType,
      academicYearId: target.academicYearId, classId: target.classId ?? null,
    }));
    if (!teacherCoversTargets(auth, proposed)) {
      throw new ForbiddenError('Teachers may target only currently assigned Classes and never the whole School.');
    }
  }
  try {
    const targets = await repo.insertTargets(db, input.targets.map((target) => ({
      schoolId: actor.schoolId,
      announcementVersionId: version.id,
      audience: target.audience,
      targetType: target.targetType,
      academicYearId: target.academicYearId,
      classId: target.classId ?? null,
    })));
    return targets.map(view);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AnnouncementDomainError(
        'DUPLICATE_ANNOUNCEMENT_TARGET',
        'The Announcement Version already has this logical target.',
      );
    }
    throw error;
  }
}

export async function listAnnouncementPublications(
  db: AnnouncementsDb,
  actor: AnnouncementActor,
  id: string,
  input: PageInput,
) {
  const row = await announcement(db, actor, id);
  await requireManagement(db, actor, row, 'announcements.read');
  const result = await repo.listPublications(db, actor.schoolId, row.id, paging(input));
  return {
    data: result.rows,
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}
