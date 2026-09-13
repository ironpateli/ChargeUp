import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import {
  getOwnerBookings,
  getOwnerChargers
} from './owner.service.js';

export const ownerRouter = Router();

ownerRouter.get('/bookings', requireAuth, requireRole('CHARGER_OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const bookings = await getOwnerBookings(req.user.id);
    res.json({ data: { bookings } });
  } catch (error) {
    next(error);
  }
});

ownerRouter.get('/chargers', requireAuth, requireRole('CHARGER_OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const chargers = await getOwnerChargers(req.user.id);
    res.json({ data: { chargers } });
  } catch (error) {
    next(error);
  }
});
