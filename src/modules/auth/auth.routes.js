import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  res.status(501).json({
    message: 'Auth registration will be implemented after the user and role schema is finalized.'
  });
});

authRouter.post('/login', (req, res) => {
  res.status(501).json({
    message: 'Auth login will be implemented after password storage and JWT strategy are finalized.'
  });
});
