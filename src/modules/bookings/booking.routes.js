import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { createBooking } from './booking.service.js';
import { createBookingSchema } from './booking.schemas.js';

export const bookingRouter = Router();

bookingRouter.post('/', validate(createBookingSchema), async (req, res, next) => {
  try {
    const booking = await createBooking(req.validated.body);
    res.status(201).json({ data: booking });
  } catch (error) {
    next(error);
  }
});
