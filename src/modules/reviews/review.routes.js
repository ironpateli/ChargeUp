import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createReview,
  getChargerReviews
} from './review.service.js';
import {
  createReviewSchema,
  listChargerReviewsSchema
} from './review.schemas.js';

export const reviewRouter = Router();

reviewRouter.post('/', requireAuth, validate(createReviewSchema), async (req, res, next) => {
  try {
    const review = await createReview(req.user.id, req.validated.body);
    res.status(201).json({ data: { review } });
  } catch (error) {
    next(error);
  }
});

reviewRouter.get('/chargers/:chargerId', validate(listChargerReviewsSchema), async (req, res, next) => {
  try {
    const reviews = await getChargerReviews(req.validated.params.chargerId);
    res.json({ data: { reviews } });
  } catch (error) {
    next(error);
  }
});
