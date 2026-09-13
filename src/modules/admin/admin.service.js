import { query, withTransaction } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';
import { hashPassword } from '../../shared/security/password.js';

function toAdminOwnerProfile(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    fullName: row.full_name,
    email: row.email,
    displayName: row.display_name,
    verificationStatus: row.verification_status,
    chargerCount: row.charger_count === undefined ? undefined : Number(row.charger_count),
    activeChargerCount: row.active_charger_count === undefined ? undefined : Number(row.active_charger_count),
    createdAt: row.created_at
  };
}

function toAdminCharger(row) {
  return {
    id: Number(row.id),
    ownerProfileId: Number(row.owner_profile_id),
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    name: row.name,
    addressLine1: row.address_line_1,
    city: row.city,
    state: row.state,
    powerKw: row.power_kw,
    pricePerHour: row.price_per_hour,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function getAllOwnerProfiles() {
  const result = await query(
    `
      SELECT
        op.id,
        op.user_id,
        u.full_name,
        u.email,
        op.display_name,
        op.verification_status,
        count(c.id) AS charger_count,
        count(c.id) FILTER (WHERE c.status = 'ACTIVE') AS active_charger_count,
        op.created_at
      FROM owner_profiles op
      JOIN users u ON u.id = op.user_id
      LEFT JOIN chargers c ON c.owner_profile_id = op.id
      WHERE u.role != 'ADMIN'
      GROUP BY op.id, u.id
      ORDER BY op.created_at DESC
    `
  );

  return result.rows.map(toAdminOwnerProfile);
}

export async function createOwnerProfileAsAdmin(input) {
  return withTransaction(async (client) => {
    const existingUserResult = await client.query(
      `
        SELECT id, role
        FROM users
        WHERE email = $1
      `,
      [input.email]
    );

    let user = existingUserResult.rows[0];

    if (user?.role === 'ADMIN') {
      throw new AppError('Admin accounts cannot be converted into managed owners.', 409, 'ADMIN_ACCOUNT_NOT_MANAGED_OWNER');
    }

    if (user) {
      const existingProfile = await client.query(
        `
          SELECT id
          FROM owner_profiles
          WHERE user_id = $1
        `,
        [user.id]
      );

      if (existingProfile.rows[0]) {
        throw new AppError('Owner profile already exists for this email.', 409, 'OWNER_PROFILE_ALREADY_EXISTS');
      }

      await client.query(
        `
          UPDATE users
          SET role = 'CHARGER_OWNER',
              updated_at = now()
          WHERE id = $1
        `,
        [user.id]
      );
    } else {
      const passwordHash = await hashPassword(input.password);
      const userResult = await client.query(
        `
          INSERT INTO users (
            full_name,
            email,
            password_hash,
            role
          )
          VALUES ($1, $2, $3, 'CHARGER_OWNER')
          RETURNING id, role
        `,
        [input.fullName, input.email, passwordHash]
      );

      user = userResult.rows[0];
    }

    const ownerProfileResult = await client.query(
      `
        INSERT INTO owner_profiles (
          user_id,
          display_name,
          verification_status,
          payout_account_reference
        )
        VALUES ($1, $2, 'VERIFIED', $3)
        RETURNING id
      `,
      [user.id, input.displayName, input.payoutAccountReference ?? null]
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
          count(c.id) AS charger_count,
          count(c.id) FILTER (WHERE c.status = 'ACTIVE') AS active_charger_count,
          op.created_at
        FROM owner_profiles op
        JOIN users u ON u.id = op.user_id
        LEFT JOIN chargers c ON c.owner_profile_id = op.id
        WHERE op.id = $1
        GROUP BY op.id, u.id
      `,
      [ownerProfileResult.rows[0].id]
    );

    return toAdminOwnerProfile(enriched.rows[0]);
  });
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
          AND role != 'ADMIN'
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

export async function suspendOwnerProfile(ownerProfileId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE owner_profiles
        SET verification_status = 'SUSPENDED',
            updated_at = now()
        WHERE id = $1
        RETURNING id, user_id
      `,
      [ownerProfileId]
    );

    const ownerProfile = result.rows[0];

    if (!ownerProfile) {
      throw new AppError('Owner profile not found.', 404, 'OWNER_PROFILE_NOT_FOUND');
    }

    await client.query(
      `
        UPDATE users
        SET role = 'EV_USER',
            updated_at = now()
        WHERE id = $1
          AND role = 'CHARGER_OWNER'
      `,
      [ownerProfile.user_id]
    );

    await client.query(
      `
        UPDATE chargers
        SET status = 'SUSPENDED',
            updated_at = now()
        WHERE owner_profile_id = $1
      `,
      [ownerProfileId]
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
          count(c.id) AS charger_count,
          count(c.id) FILTER (WHERE c.status = 'ACTIVE') AS active_charger_count,
          op.created_at
        FROM owner_profiles op
        JOIN users u ON u.id = op.user_id
        LEFT JOIN chargers c ON c.owner_profile_id = op.id
        WHERE op.id = $1
        GROUP BY op.id, u.id
      `,
      [ownerProfileId]
    );

    return toAdminOwnerProfile(enriched.rows[0]);
  });
}

export async function restoreOwnerProfile(ownerProfileId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE owner_profiles
        SET verification_status = 'VERIFIED',
            updated_at = now()
        WHERE id = $1
        RETURNING id, user_id
      `,
      [ownerProfileId]
    );

    const ownerProfile = result.rows[0];

    if (!ownerProfile) {
      throw new AppError('Owner profile not found.', 404, 'OWNER_PROFILE_NOT_FOUND');
    }

    await client.query(
      `
        UPDATE users
        SET role = 'CHARGER_OWNER',
            updated_at = now()
        WHERE id = $1
          AND role != 'ADMIN'
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
          count(c.id) AS charger_count,
          count(c.id) FILTER (WHERE c.status = 'ACTIVE') AS active_charger_count,
          op.created_at
        FROM owner_profiles op
        JOIN users u ON u.id = op.user_id
        LEFT JOIN chargers c ON c.owner_profile_id = op.id
        WHERE op.id = $1
        GROUP BY op.id, u.id
      `,
      [ownerProfileId]
    );

    return toAdminOwnerProfile(enriched.rows[0]);
  });
}

export async function getAllChargersForAdmin() {
  const result = await query(
    `
      SELECT
        c.id,
        c.owner_profile_id,
        op.display_name AS owner_name,
        u.email AS owner_email,
        c.name,
        c.address_line_1,
        c.city,
        c.state,
        c.power_kw,
        c.price_per_hour,
        c.status,
        c.created_at
      FROM chargers c
      JOIN owner_profiles op ON op.id = c.owner_profile_id
      JOIN users u ON u.id = op.user_id
      ORDER BY c.created_at DESC
    `
  );

  return result.rows.map(toAdminCharger);
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

export async function updateAdminChargerStatus(chargerId, status) {
  const result = await query(
    `
      UPDATE chargers
      SET status = $2,
          updated_at = now()
      WHERE id = $1
      RETURNING id
    `,
    [chargerId, status]
  );

  if (!result.rows[0]) {
    throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
  }

  const enriched = await query(
    `
      SELECT
        c.id,
        c.owner_profile_id,
        op.display_name AS owner_name,
        u.email AS owner_email,
        c.name,
        c.address_line_1,
        c.city,
        c.state,
        c.power_kw,
        c.price_per_hour,
        c.status,
        c.created_at
      FROM chargers c
      JOIN owner_profiles op ON op.id = c.owner_profile_id
      JOIN users u ON u.id = op.user_id
      WHERE c.id = $1
    `,
    [chargerId]
  );

  return toAdminCharger(assertFound(enriched.rows[0], 'Charger not found.'));
}
