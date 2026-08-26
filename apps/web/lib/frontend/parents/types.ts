import type { PageMeta, PageResponse, Timestamps } from '@/lib/frontend/academic/types';

export type ParentStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type RelationshipStatus = 'ACTIVE' | 'ENDED';

export interface ParentDto extends Timestamps {
  id: string; firstName: string; lastName: string; parentCode: string | null;
  userId: string | null; status: ParentStatus;
}
export interface ParentRelationshipDto extends Timestamps {
  id: string; parentId: string; studentId: string; status: RelationshipStatus;
}
export interface ParentBootstrapProfile {
  parent: { id: string; firstName: string; lastName: string; status: 'ACTIVE' };
  children: Array<{ relationshipId: string; student: { id: string; firstName: string; lastName: string; studentCode: string | null } }>;
}
export interface ParentListParams { page?: number; pageSize?: number; status?: ParentStatus; search?: string; parentCode?: string; studentId?: string }
export interface RelationshipListParams { page?: number; pageSize?: number; status?: RelationshipStatus; studentId?: string }
export interface DataResponse<T> { data: T }
export type { PageMeta, PageResponse };
