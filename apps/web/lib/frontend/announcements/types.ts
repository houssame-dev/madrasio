import type { PageResponse, Timestamps } from '@/lib/frontend/academic/types';

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type AnnouncementAudience = 'PARENTS' | 'TEACHERS';
export type AnnouncementTargetType = 'SCHOOL' | 'CLASS';
export type AnnouncementPublicationStatus = 'SCHEDULED' | 'PUBLISHED';

export interface AnnouncementVersionDto extends Timestamps {
  id: string; announcementId: string; versionNumber: number; title: string; body: string; createdBy: string;
}
export interface AnnouncementDto extends Timestamps {
  id: string; status: AnnouncementStatus; createdBy: string; latestVersion: AnnouncementVersionDto | null;
}
export interface AnnouncementDetailDto {
  announcement: Omit<AnnouncementDto, 'latestVersion'>;
  latestVersion: AnnouncementVersionDto;
  targetSummary: { count: number; audiences: AnnouncementAudience[]; targetTypes: AnnouncementTargetType[] };
  publicationSummary: { count: number; latest: null | { id: string; announcementVersionId: string; publicationVersion: number; status: AnnouncementPublicationStatus; scheduledAt: string | null; publishedAt: string | null } };
}
export interface AnnouncementTargetDto {
  id: string; announcementVersionId: string; audience: AnnouncementAudience; targetType: AnnouncementTargetType; academicYearId: string; classId: string | null;
}
export interface AnnouncementPublicationDto {
  id: string; announcementId: string; announcementVersionId: string; publicationVersion: number; status: AnnouncementPublicationStatus; scheduledAt: string | null; publishedAt: string | null; publishedBy: string; createdAt: string; recipientCount: number;
}
export interface AnnouncementPublishDto {
  publicationId: string; announcementId: string; announcementVersionId: string; publicationVersion: number; status: AnnouncementPublicationStatus; scheduledAt: string | null; publishedAt: string | null; publishedBy: string; idempotencyKey: string; eventEmitted: boolean;
}
export interface AnnouncementListParams {
  page?: number; pageSize?: number; status?: AnnouncementStatus; audience?: AnnouncementAudience; targetType?: AnnouncementTargetType; classId?: string; publicationStatus?: AnnouncementPublicationStatus; createdFrom?: string; createdTo?: string; search?: string;
}
export interface AnnouncementTargetInput { audience: AnnouncementAudience; targetType: AnnouncementTargetType; academicYearId: string; classId?: string }
export type AnnouncementPage = PageResponse<AnnouncementDto>;
export type AnnouncementVersionPage = PageResponse<AnnouncementVersionDto>;
export type AnnouncementPublicationPage = PageResponse<AnnouncementPublicationDto>;
