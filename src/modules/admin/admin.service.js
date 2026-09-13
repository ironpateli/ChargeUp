import { query, withTransaction } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';

function toAdminOwnerProfile(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    fullName: row.full_name,
    email: row.email,
    displayName: row.display_name,
    verificationStatus: row.verification_status,
    createdAt: row.created_at
  };
}

function toAdminCharger(row) {
  return {
    id: Number(row.id),
    ownerProfileId: Number(row.owner_profile_id),
    name: row.name,
    city: row.city,
    state: row.state,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function getPendingOwnerProfiles() {
  const result = await query(
    `
      SELECT
        op.id,
        op.user_id,
        u.full_name,
        u.email,
        op.display_name,
        op.verification_status,
        op.created_at
      FROM owner_profiles op
      JOIN users u ON u.id = op.user_id
      WHERE op.verification_status = 'PENDING_VERIFICATION'
      ORDER BY op.created_at ASC
    `
  );

  return result.rows.map(toAdminOwnerProfile);
}

export async function approveOwnerProfile(ownerProfileId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE owner_profiles
        SET verification_status = 'VERIFIED',
            updated_at = now()
        WHERE id = $1
          AND verification_status = 'PENDING_VERIFICATION'
        RETURNING id, user_id, display_name, verification_status, created_at
      `,
      [ownerProfileId]
    );

    const ownerProfile = result.rows[0];

    if (!ownerProfile) {
      const existing = await client.query('SELECT id FROM owner_profiles WHERE id = $1', [ownerProfileId]);

      if (!existing.rows[0]) {
        throw new AppError('Owner profile not found.', 404, 'OWNER_PROFILE_NOT_FOUND');
      }

      throw new AppError('Only pending owner profiles can be approved.', 409, 'OWNER_PROFILE_NOT_APPROVABLE');
    }

    await client.query(
      `
        UPDATE users
        SET role = 'CHARGER_OWNER',
            updated_at = now()
        WHERE id = $1
      `,
      [ownerProfile.user_id]
    );

    const enriched = await client.query(
      `
        SELECT
          op.id,
          op.user_id,
          u.full_name,
          u.email,
          op.display_name,
          op.verification_status,
          op.created_at
        FROM owner_profiles op
        JOIN users u ON u.id = op.user_id
        WHERE op.id = $1
      `,
      [ownerProfile.id]
    );

    return toAdminOwnerProfile(enriched.rows[0]);
  });
}

export async function rejectOwnerProfile(ownerProfileId) {
  const result = await query(
    `
      UPDATE owner_profiles
      SET verification_status = 'REJECTED',
          updated_at = now()
      WHERE id = $1
        AND verification_status = 'PENDING_VERIFICATION'
      RETURNING id
    `,
    [ownerProfileId]
  );

  if (!result.rows[0]) {
    const existing = await query('SELECT id FROM owner_profiles WHERE id = $1', [ownerProfileId]);

    if (!existing.rows[0]) {
      throw new AppError('Owner profile not found.', 404, 'OWNER_PROFILE_NOT_FOUND');
    }

    throw new AppError('Only pending owner profiles can be rejected.', 409, 'OWNER_PROFILE_NOT_REJECTABLE');
  }

  const enriched = await query(
    `
      SELECT
        op.id,
        op.user_id,
        u.full_name,
        u.email,
        op.display_name,
        op.verification_status,
        op.created_at
      FROM owner_profiles op
      JOIN users u ON u.id = op.user_id
      WHERE op.id = $1
    `,
    [ownerProfileId]
  );

  return toAdminOwnerProfile(enriched.rows[0]);
}

export async function getPendingChargers() {
  const result = await query(
    `
      SELECT id, owner_profile_id, name, city, state, status, created_at
      FROM chargers
      WHERE status = 'PENDING_VERIFICATION'
      ORDER BY created_at ASC
    `
  );

  return result.rows.map(toAdminCharger);
}

export async function verifyCharger(chargerId) {
  const result = await query(
    `
      UPDATE chargers
      SET status = 'ACTIVE',
          updated_at = now()
      WHERE id = $1
        AND status = 'PENDING_VERIFICATION'
      RETURNING id, owner_profile_id, name, city, state, status, created_at
    `,
    [chargerId]
  );

  if (!result.rows[0]) {
    const existing = await query('SELECT id FROM chargers WHERE id = $1', [chargerId]);

    if (!existing.rows[0]) {
      throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
    }

    throw new AppError('Only pending chargers can be verified.', 409, 'CHARGER_NOT_VERIFIABLE');
  }

  return toAdminCharger(assertFound(result.rows[0], 'Charger not found.'));
}
