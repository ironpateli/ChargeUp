import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  getCurrentUser,
  loginUser,
  registerUser
} from './auth.service.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await registerUser(req.validated.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.validated.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.id);
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
});
