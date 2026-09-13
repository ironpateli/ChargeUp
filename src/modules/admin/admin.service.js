import { query } from '../../shared/db.js';
import { AppError, assertFound } from '../../shared/errors.js';

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
