import { query } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';
import { signAccessToken } from '../../shared/security/jwt.js';
import {
  hashPassword,
  runDummyPasswordCheck,
  verifyPassword
} from '../../shared/security/password.js';

function toPublicUser(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at
  };
}

function authResponse(userRow) {
  const user = toPublicUser(userRow);

  return {
    user,
    accessToken: signAccessToken(user)
  };
}

export async function registerUser(input) {
  const passwordHash = await hashPassword(input.password);

  try {
    const result = await query(
      `
        INSERT INTO users (
          full_name,
          email,
          password_hash
        )
        VALUES ($1, $2, $3)
        RETURNING id, full_name, email, role, created_at
      `,
      [input.fullName, input.email, passwordHash]
    );

    return authResponse(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Email is already registered.', 409, 'EMAIL_ALREADY_REGISTERED');
    }

    throw error;
  }
}

export async function loginUser(input) {
  const result = await query(
    `
      SELECT id, full_name, email, password_hash, role, created_at
      FROM users
      WHERE email = $1
    `,
    [input.email]
  );

  const user = result.rows[0];

  if (!user) {
    await runDummyPasswordCheck(input.password);
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await verifyPassword(input.password, user.password_hash);

  if (!passwordMatches) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  return authResponse(user);
}

export async function getCurrentUser(userId) {
  const result = await query(
    `
      SELECT id, full_name, email, role, created_at
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return toPublicUser(assertFound(result.rows[0], 'User not found.'));
}
