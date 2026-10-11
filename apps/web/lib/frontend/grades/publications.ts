import type { ResultDisplayContext } from '@school/database';

export interface PublicationSnapshot {
  publicationId: string; resultType: string; value: string; publicationVersion: number; publishedAt: string;
  academicYearId: string; gradingConfigurationVersionId: string; displayContext: ResultDisplayContext | null; state: 'PUBLISHED' | 'REVISED';
}
export interface PublicationHistoryPage {
  selected: PublicationSnapshot; data: PublicationSnapshot[];
  meta: { page: number; pageSize: number; total: number };
}
