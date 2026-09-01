import { z } from 'zod';

export const setPasswordSchema = z.object({
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, {
  path: ['confirmation'], message: 'Passwords must match.',
});

export type SetPasswordValues = z.input<typeof setPasswordSchema>;

