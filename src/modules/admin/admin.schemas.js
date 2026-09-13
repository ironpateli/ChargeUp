import { z } from 'zod';

export const adminChargerSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  })
});

export const adminOwnerProfileSchema = z.object({
  params: z.object({
    ownerProfileId: z.coerce.number().int().positive()
  })
});
