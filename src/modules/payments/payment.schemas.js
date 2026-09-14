import { z } from 'zod';

const isoDateTime = z.coerce.date({
  required_error: 'Slot time is required.',
  invalid_type_error: 'Slot time must be a valid date-time.'
});

export const createCheckoutSchema = z.object({
  body: z.object({
    chargerId: z.number().int().positive(),
    startsAt: isoDateTime,
    endsAt: isoDateTime
  }).refine((value) => value.endsAt > value.startsAt, {
    message: 'End time must be after start time.',
    path: ['endsAt']
  })
});

export const verifyRazorpayPaymentSchema = z.object({
  body: z.object({
    paymentId: z.number().int().positive(),
    razorpayOrderId: z.string().trim().min(1, 'Razorpay order id is required.'),
    razorpayPaymentId: z.string().trim().min(1, 'Razorpay payment id is required.'),
    razorpaySignature: z.string().trim().min(1, 'Razorpay signature is required.')
  })
});

export const mockFailPaymentSchema = z.object({
  params: z.object({
    paymentId: z.coerce.number().int().positive()
  })
});
