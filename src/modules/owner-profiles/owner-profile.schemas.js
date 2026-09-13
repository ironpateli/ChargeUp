import { z } from 'zod';

export const createOwnerProfileSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(2).max(120),
    payoutAccountReference: z.string().trim().max(200).optional()
  })
});
