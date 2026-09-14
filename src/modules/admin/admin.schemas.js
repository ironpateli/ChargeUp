import { z } from 'zod';

const email = z.string({
  required_error: 'Email is required.',
  invalid_type_error: 'Email must be text.'
}).trim().email('Enter a valid email address.').toLowerCase();

const password = z.string({
  required_error: 'Password is required.',
  invalid_type_error: 'Password must be text.'
}).min(8, 'Password must be at least 8 characters.').max(128, 'Password must be at most 128 characters.');

export const adminCreateOwnerProfileSchema = z.object({
  body: z.object({
    fullName: z.string({
      required_error: 'Full name is required.',
      invalid_type_error: 'Full name must be text.'
    }).trim().min(2, 'Full name must be at least 2 characters.').max(120, 'Full name must be at most 120 characters.'),
    email,
    password,
    displayName: z.string({
      required_error: 'Business name is required.',
      invalid_type_error: 'Business name must be text.'
    }).trim().min(2, 'Business name must be at least 2 characters.').max(120, 'Business name must be at most 120 characters.'),
    payoutAccountReference: z.string().trim().max(200).optional()
  })
});

export const adminChargerSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  })
});

export const adminChargerStatusSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  })
});

export const adminOwnerProfileSchema = z.object({
  params: z.object({
    ownerProfileId: z.coerce.number().int().positive()
  })
});
