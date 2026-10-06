import { z } from 'zod';

// Closed semantic inventory. Add each future action deliberately, never accept a request body.
export const schoolAuditEventSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('ClassCurriculumChanged'),
      resourceId: z.string().uuid(),
      metadata: z
        .object({ previousVersionId: z.string().uuid(), newVersionId: z.string().uuid() })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('CurriculumVersionStatusChanged'),
      resourceId: z.string().uuid(),
      metadata: z
        .object({
          previousStatus: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
          newStatus: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
        })
        .strict(),
    })
    .strict(),
]);
export type SchoolAuditEvent = z.infer<typeof schoolAuditEventSchema>;
export const auditPageSchema = z
  .object({ page: z.number().int().min(1).max(10000), pageSize: z.number().int().min(1).max(100) })
  .strict();
