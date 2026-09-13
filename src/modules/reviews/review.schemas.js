import { z } from 'zod';

export const createReviewSchema = z.object({
  body: z.object({
    bookingId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional()
  })
});

export const listChargerReviewsSchema = z.object({
  params: z.object({
    chargerId: z.coerce.number().int().positive()
  })
});
