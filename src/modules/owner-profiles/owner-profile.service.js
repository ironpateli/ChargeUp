import { query, withTransaction } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';

function toOwnerProfile(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    displayName: row.display_name,
    verificationStatus: row.verification_status,
    payoutAccountReference: row.payout_account_reference,
    createdAt: row.created_at
  };
}

export async function createOwnerProfile(userId, input) {
  return withTransaction(async (client) => {
    try {
      const result = await client.query(
        `
          INSERT INTO owner_profiles (
            user_id,
            display_name,
            payout_account_reference
          )
          VALUES ($1, $2, $3)
          RETURNING id, user_id, display_name, verification_status, payout_account_reference, created_at
        `,
        [
          userId,
          input.displayName,
          input.payoutAccountReference ?? null
        ]
      );

      return toOwnerProfile(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError('Owner profile already exists for this user.', 409, 'OWNER_PROFILE_ALREADY_EXISTS');
      }

      throw error;
    }
  });
}

export async function getMyOwnerProfile(userId) {
  const result = await query(
    `
      SELECT id, user_id, display_name, verification_status, payout_account_reference, created_at
      FROM owner_profiles
      WHERE user_id = $1
    `,
    [userId]
  );

  return toOwnerProfile(assertFound(result.rows[0], 'Owner profile not found.'));
}

export async function getOwnerProfileByUserId(userId) {
  const result = await query(
    `
      SELECT id, user_id, display_name, verification_status, payout_account_reference, created_at
      FROM owner_profiles
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] ? toOwnerProfile(result.rows[0]) : null;
}
