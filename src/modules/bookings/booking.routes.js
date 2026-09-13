import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createBooking,
  getMyBookings
} from './booking.service.js';
import { createBookingSchema } from './booking.schemas.js';

export const bookingRouter = Router();

bookingRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const bookings = await getMyBookings(req.user.id);
    res.json({ data: { bookings } });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post('/', requireAuth, validate(createBookingSchema), async (req, res, next) => {
  try {
    const booking = await createBooking(req.user.id, req.validated.body);
    res.status(201).json({ data: booking });
  } catch (error) {
    next(error);
  }
});
