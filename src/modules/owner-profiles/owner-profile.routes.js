import { Router } from 'express';
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
