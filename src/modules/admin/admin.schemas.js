import { z } from 'zod';

const email = z.string().trim().email().toLowerCase();
const password = z.string().min(8).max(128);

export const adminCreateOwnerProfileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    email,
    password,
    displayName: z.string().trim().min(2).max(120),
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
