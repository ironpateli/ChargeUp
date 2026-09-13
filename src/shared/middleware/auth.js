import { AppError } from '../errors.js';
import { verifyAccessToken } from '../security/jwt.js';
import { query } from '../db.js';

export async function requireAuth(req, res, next) {
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
    const result = await query(
      `
        SELECT id, role
        FROM users
        WHERE id = $1
      `,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user) {
      return next(new AppError('Invalid or expired access token.', 401, 'INVALID_ACCESS_TOKEN'));
    }

    req.user = {
      id: Number(user.id),
      role: user.role
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
