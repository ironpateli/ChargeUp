import { query, withTransaction } from '../../shared/db.js';
import { AppError } from '../../shared/errors.js';

function toBookingSummary(row) {
  return {
    id: Number(row.id),
    chargerId: Number(row.charger_id),
    chargerName: row.charger_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function getMyBookings(userId) {
  const result = await query(
    `
      SELECT
        b.id,
        b.charger_id,
        c.name AS charger_name,
        b.starts_at,
        b.ends_at,
        b.status,
        b.created_at
      FROM bookings b
      JOIN chargers c ON c.id = b.charger_id
      WHERE b.user_id = $1
      ORDER BY b.starts_at DESC
    `,
    [userId]
  );

  return result.rows.map(toBookingSummary);
}

export async function createBooking(userId, input) {
  return withTransaction(async (client) => {
    const chargerResult = await client.query(
      `
        SELECT id, status
        FROM chargers
        WHERE id = $1
      `,
      [input.chargerId]
    );

    const charger = chargerResult.rows[0];

    if (!charger) {
      throw new AppError('Charger not found.', 404, 'CHARGER_NOT_FOUND');
    }

    if (charger.status !== 'ACTIVE') {
      throw new AppError('Charger is not available for booking.', 409, 'CHARGER_NOT_BOOKABLE');
    }

    const bookingResult = await client.query(
      `
        INSERT INTO bookings (
          user_id,
          charger_id,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, $4, 'CONFIRMED')
        RETURNING *
      `,
      [userId, input.chargerId, input.startsAt, input.endsAt]
    );

    return bookingResult.rows[0];
  });
}
