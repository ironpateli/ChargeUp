import { z } from 'zod';

export const createOwnerProfileSchema = z.object({
  body: z.object({
    displayName: z.string({
      required_error: 'Business display name is required.',
      invalid_type_error: 'Business display name must be text.'
    }).trim().min(2, 'Business display name must be at least 2 characters.').max(120, 'Business display name must be at most 120 characters.'),
    payoutAccountReference: z.string({
      invalid_type_error: 'Payout reference must be text.'
    }).trim().max(200, 'Payout reference must be at most 200 characters.').optional()
  })
});
