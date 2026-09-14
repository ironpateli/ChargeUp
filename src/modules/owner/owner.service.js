import { query } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';
import {
  expirePendingPaymentBookings,
  markExpiredConfirmedBookingsCompleted
} from '../bookings/booking.service.js';

async function getOwnerProfileId(userId) {
  const result = await query(
    `
      SELECT id
      FROM owner_profiles
      WHERE user_id = $1
    `,
    [userId]
  );

  const ownerProfile = result.rows[0];

  if (!ownerProfile) {
    throw new AppError('Owner profile not found.', 404, 'OWNER_PROFILE_NOT_FOUND');
  }

  return ownerProfile.id;
}

export async function getOwnerBookings(userId) {
  const ownerProfileId = await getOwnerProfileId(userId);
  await expirePendingPaymentBookings();
  await markExpiredConfirmedBookingsCompleted();

  const result = await query(
    `
      SELECT
        b.id,
        b.user_id,
        b.charger_id,
        b.charger_unit_id,
        cu.unit_number,
        c.name AS charger_name,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at
      FROM bookings b
      JOIN chargers c ON c.id = b.charger_id
      JOIN charger_units cu ON cu.id = b.charger_unit_id
      WHERE c.owner_profile_id = $1
      ORDER BY b.starts_at DESC
    `,
    [ownerProfileId]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    chargerId: Number(row.charger_id),
    chargerUnitId: Number(row.charger_unit_id),
    unitNumber: Number(row.unit_number),
    chargerName: row.charger_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  }));
}

export async function getOwnerChargers(userId) {
  const ownerProfileId = await getOwnerProfileId(userId);
  const result = await query(
    `
      SELECT
        c.id,
        c.name,
        c.address_line_1,
        c.city,
        c.state,
        array_agg(cct.connector_type ORDER BY cct.connector_type) AS connector_types,
        c.power_kw,
        c.price_per_hour,
        c.charger_count,
        c.status,
        c.created_at
      FROM chargers c
      JOIN charger_connector_types cct ON cct.charger_id = c.id
      WHERE c.owner_profile_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `,
    [ownerProfileId]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    addressLine1: row.address_line_1,
    city: row.city,
    state: row.state,
    connectorTypes: row.connector_types,
    powerKw: row.power_kw,
    pricePerHour: row.price_per_hour,
    chargerCount: Number(row.charger_count),
    status: row.status,
    createdAt: row.created_at
  }));
}
