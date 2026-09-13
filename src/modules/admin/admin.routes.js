import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  adminChargerSchema,
  adminOwnerProfileSchema
} from './admin.schemas.js';
import {
  approveOwnerProfile,
  getPendingChargers,
  getPendingOwnerProfiles,
  rejectOwnerProfile,
  verifyCharger
} from './admin.service.js';

export const adminRouter = Router();

adminRouter.get('/owner-profiles/pending', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const ownerProfiles = await getPendingOwnerProfiles();
    res.json({ data: { ownerProfiles } });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/owner-profiles/:ownerProfileId/approve', requireAuth, requireRole('ADMIN'), validate(adminOwnerProfileSchema), async (req, res, next) => {
  try {
    const ownerProfile = await approveOwnerProfile(req.validated.params.ownerProfileId);
    res.json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/owner-profiles/:ownerProfileId/reject', requireAuth, requireRole('ADMIN'), validate(adminOwnerProfileSchema), async (req, res, next) => {
  try {
    const ownerProfile = await rejectOwnerProfile(req.validated.params.ownerProfileId);
    res.json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

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
