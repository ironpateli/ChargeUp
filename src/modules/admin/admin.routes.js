import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  adminCreateOwnerProfileSchema,
  adminChargerSchema,
  adminChargerStatusSchema,
  adminOwnerProfileSchema
} from './admin.schemas.js';
import {
  approveOwnerProfile,
  createOwnerProfileAsAdmin,
  getAllChargersForAdmin,
  getAllOwnerProfiles,
  getPendingChargers,
  getPendingOwnerProfiles,
  rejectOwnerProfile,
  restoreOwnerProfile,
  suspendOwnerProfile,
  updateAdminChargerStatus,
  verifyCharger
} from './admin.service.js';

export const adminRouter = Router();

adminRouter.get('/owner-profiles', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const ownerProfiles = await getAllOwnerProfiles();
    res.json({ data: { ownerProfiles } });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/owner-profiles', requireAuth, requireRole('ADMIN'), validate(adminCreateOwnerProfileSchema), async (req, res, next) => {
  try {
    const ownerProfile = await createOwnerProfileAsAdmin(req.validated.body);
    res.status(201).json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

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

adminRouter.patch('/owner-profiles/:ownerProfileId/suspend', requireAuth, requireRole('ADMIN'), validate(adminOwnerProfileSchema), async (req, res, next) => {
  try {
    const ownerProfile = await suspendOwnerProfile(req.validated.params.ownerProfileId);
    res.json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/owner-profiles/:ownerProfileId/restore', requireAuth, requireRole('ADMIN'), validate(adminOwnerProfileSchema), async (req, res, next) => {
  try {
    const ownerProfile = await restoreOwnerProfile(req.validated.params.ownerProfileId);
    res.json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/chargers', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const chargers = await getAllChargersForAdmin();
    res.json({ data: { chargers } });
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

adminRouter.patch('/chargers/:chargerId/status', requireAuth, requireRole('ADMIN'), validate(adminChargerStatusSchema), async (req, res, next) => {
  try {
    const charger = await updateAdminChargerStatus(req.validated.params.chargerId, req.validated.body.status);
    res.json({ data: { charger } });
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
