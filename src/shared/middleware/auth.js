import { AppError } from '../errors.js';
import { verifyAccessToken } from '../security/jwt.js';

export function requireAuth(req, res, next) {
  const authHeader = req.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED'));
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    return next(new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED'));
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: Number(payload.sub),
      role: payload.role
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTHENTICATION_REQUIRED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
    }

    return next();
  };
}
