import { z } from 'zod';

export const cancelBookingSchema = z.object({
  params: z.object({
    bookingId: z.coerce.number().int().positive()
  })
});

export const createBookingSchema = z.object({
  body: z.object({
    chargerId: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date()
  }).refine((value) => value.endsAt > value.startsAt, {
    message: 'endsAt must be after startsAt.',
    path: ['endsAt']
  })
});
