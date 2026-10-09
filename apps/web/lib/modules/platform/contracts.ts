import { z } from 'zod';
import { validateSchoolTimezone } from '@school/shared';

export const schoolInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    timezone: z
      .string()
      .trim()
      .refine((value) => {
        try {
          validateSchoolTimezone(value);
          return true;
        } catch {
          return false;
        }
      }, 'Use a valid IANA timezone.')
      .default('UTC'),
  })
  .strict();
export const adminInput = z.object({ email: z.string().trim().email().max(254) }).strict();
export const membershipInput = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();
export const platformId = z.string().uuid();
export const platformPage = z.coerce.number().int().min(1).max(10000).default(1);
export type SchoolSummary = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  timezone: string;
};
export type AdminSummary = {
  id: string;
  userId: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
};
