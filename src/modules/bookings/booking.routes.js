import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  cancelBooking,
  clearMyCancelledBookings,
  clearMyCompletedBookings,
  getMyBookings
} from './booking.service.js';
import {
  cancelBookingSchema,
  createBookingSchema
} from './booking.schemas.js';

export const bookingRouter = Router();

bookingRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const bookings = await getMyBookings(req.user.id);
    res.json({ data: { bookings } });
  } catch (error) {
    next(error);
  }
});

bookingRouter.delete('/me/cancelled', requireAuth, async (req, res, next) => {
  try {
    const deletedCount = await clearMyCancelledBookings(req.user.id);
    res.json({ data: { deletedCount } });
  } catch (error) {
    next(error);
  }
});

bookingRouter.delete('/me/completed', requireAuth, async (req, res, next) => {
  try {
    const deletedCount = await clearMyCompletedBookings(req.user.id);
    res.json({ data: { deletedCount } });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post('/', requireAuth, validate(createBookingSchema), async (req, res, next) => {
  try {
    throw new AppError('Bookings must be created through payment checkout.', 402, 'BOOKING_PAYMENT_REQUIRED');
  } catch (error) {
    next(error);
  }
});

bookingRouter.patch('/:bookingId/cancel', requireAuth, validate(cancelBookingSchema), async (req, res, next) => {
  try {
    const booking = await cancelBooking(req.user.id, req.validated.params.bookingId);
    res.json({ data: { booking } });
  } catch (error) {
    next(error);
  }
});
