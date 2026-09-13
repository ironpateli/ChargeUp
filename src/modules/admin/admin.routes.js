import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { adminChargerSchema } from './admin.schemas.js';
import {
  getPendingChargers,
  verifyCharger
} from './admin.service.js';

export const adminRouter = Router();

adminRouter.get('/chargers/pending', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const chargers = await getPendingChargers();
    res.json({ data: { chargers } });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/chargers/:chargerId/verify', requireAuth, requireRole('ADMIN'), validate(adminChargerSchema), async (req, res, next) => {
  try {
    const charger = await verifyCharger(req.validated.params.chargerId);
    res.json({ data: { charger } });
  } catch (error) {
    next(error);
  }
});
