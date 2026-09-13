import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createCharger,
  getChargerAvailability,
  getChargerById,
  searchChargers,
  updateCharger,
  updateChargerStatus
} from './charger.service.js';
import {
  createChargerSchema,
  getChargerAvailabilitySchema,
  getChargerSchema,
  searchChargersSchema,
  updateChargerSchema,
  updateChargerStatusSchema
} from './charger.schemas.js';

export const chargerRouter = Router();

chargerRouter.get('/', validate(searchChargersSchema), async (req, res, next) => {
  try {
    const chargers = await searchChargers(req.validated.query);
    res.json({ data: chargers });
  } catch (error) {
    next(error);
  }
});

chargerRouter.get('/:chargerId/availability', validate(getChargerAvailabilitySchema), async (req, res, next) => {
  try {
    const availability = await getChargerAvailability(
      req.validated.params.chargerId,
      req.validated.query.date
    );

    res.json({ data: availability });
  } catch (error) {
    next(error);
  }
});

chargerRouter.get('/:chargerId', validate(getChargerSchema), async (req, res, next) => {
  try {
    const charger = await getChargerById(req.validated.params.chargerId);
    res.json({ data: charger });
  } catch (error) {
    next(error);
  }
});

chargerRouter.patch(
  '/:chargerId',
  requireAuth,
  requireRole('CHARGER_OWNER', 'ADMIN'),
  validate(updateChargerSchema),
  async (req, res, next) => {
    try {
      const charger = await updateCharger(
        req.user,
        req.validated.params.chargerId,
        req.validated.body
      );

      res.json({ data: { charger } });
    } catch (error) {
      next(error);
    }
  }
);

chargerRouter.patch(
  '/:chargerId/status',
  requireAuth,
  requireRole('CHARGER_OWNER', 'ADMIN'),
  validate(updateChargerStatusSchema),
  async (req, res, next) => {
    try {
      const charger = await updateChargerStatus(
        req.user,
        req.validated.params.chargerId,
        req.validated.body.status
      );

      res.json({ data: { charger } });
    } catch (error) {
      next(error);
    }
  }
);

chargerRouter.post(
  '/',
  requireAuth,
  requireRole('CHARGER_OWNER', 'ADMIN'),
  validate(createChargerSchema),
  async (req, res, next) => {
  try {
    const charger = await createCharger(req.user.id, req.validated.body);
    res.status(201).json({ data: charger });
  } catch (error) {
    next(error);
  }
  }
);
