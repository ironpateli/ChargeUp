import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      role: user.role
    },
    config.jwtSecret,
    {
      subject: String(user.id),
      expiresIn: config.jwtAccessTokenExpiresIn
    }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError('Invalid or expired access token.', 401, 'INVALID_ACCESS_TOKEN');
  }
}
