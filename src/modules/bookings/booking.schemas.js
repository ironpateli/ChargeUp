import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    chargerId: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date()
  }).refine((value) => value.endsAt > value.startsAt, {
    message: 'endsAt must be after startsAt.',
    path: ['endsAt']
  })
});
