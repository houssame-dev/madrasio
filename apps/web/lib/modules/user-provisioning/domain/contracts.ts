import { z } from 'zod';

export const inviteAccountSchema = z.object({
  email: z.string().trim().email().max(320),
}).strict();

export type InviteAccountInput = z.output<typeof inviteAccountSchema>;
export type ProfileKind = 'TEACHER' | 'PARENT';

export interface ProvisionedAccount {
  profileId: string;
  userId: string;
  state: 'INVITED' | 'LINKED' | 'ALREADY_LINKED';
}

