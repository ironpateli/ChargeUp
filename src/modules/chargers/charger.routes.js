import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createCharger,
  getChargerById,
  searchChargers
} from './charger.service.js';
import {
  createChargerSchema,
  getChargerSchema,
  searchChargersSchema
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

chargerRouter.get('/:chargerId', validate(getChargerSchema), async (req, res, next) => {
  try {
    const charger = await getChargerById(req.validated.params.chargerId);
    res.json({ data: charger });
  } catch (error) {
    next(error);
  }
});

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
