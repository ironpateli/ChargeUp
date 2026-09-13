import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createOwnerProfileSchema } from './owner-profile.schemas.js';
import {
  createOwnerProfile,
  getMyOwnerProfile
} from './owner-profile.service.js';

export const ownerProfileRouter = Router();

ownerProfileRouter.post('/', requireAuth, validate(createOwnerProfileSchema), async (req, res, next) => {
  try {
    if (req.user.role === 'ADMIN') {
      throw new AppError('Admins should create owner accounts from the admin dashboard.', 403, 'ADMIN_OWNER_PROFILE_SELF_SERVICE_DISABLED');
    }

    const ownerProfile = await createOwnerProfile(req.user.id, req.validated.body);
    res.status(201).json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});

ownerProfileRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const ownerProfile = await getMyOwnerProfile(req.user.id);
    res.json({ data: { ownerProfile } });
  } catch (error) {
    next(error);
  }
});
