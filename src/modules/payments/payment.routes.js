import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  createCheckoutSchema,
  mockFailPaymentSchema,
  verifyRazorpayPaymentSchema
} from './payment.schemas.js';
import {
  createCheckout,
  failMockPayment,
  verifyRazorpayPayment
} from './payment.service.js';

export const paymentRouter = Router();

paymentRouter.post('/checkout', requireAuth, validate(createCheckoutSchema), async (req, res, next) => {
  try {
    const checkout = await createCheckout(req.user, req.validated.body);
    res.status(201).json({ data: checkout });
  } catch (error) {
    next(error);
  }
});

paymentRouter.post('/razorpay/verify', requireAuth, validate(verifyRazorpayPaymentSchema), async (req, res, next) => {
  try {
    const result = await verifyRazorpayPayment(req.user.id, req.validated.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

paymentRouter.post('/mock/:paymentId/fail', requireAuth, validate(mockFailPaymentSchema), async (req, res, next) => {
  try {
    const payment = await failMockPayment(req.user.id, req.validated.params.paymentId);
    res.json({ data: { payment } });
  } catch (error) {
    next(error);
  }
});
